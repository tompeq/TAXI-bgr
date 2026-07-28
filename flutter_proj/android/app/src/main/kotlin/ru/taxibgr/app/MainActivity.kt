package ru.taxibgr.app

import android.content.ActivityNotFoundException
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    companion object {
        private const val UPDATE_CHANNEL = "ru.taxibgr.app/app_update"
        private const val UPDATE_PREFERENCES = "app_update_download"
        private const val DOWNLOAD_ID = "download_id"
        private const val DOWNLOAD_URL = "download_url"
        private const val DOWNLOAD_VERSION = "download_version"
        private const val DOWNLOAD_PATH = "download_path"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            UPDATE_CHANNEL,
        ).setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "getAppInfo" -> result.success(getAppInfo())
                    "prepareDownload" -> {
                        val fileName = call.argument<String>("fileName")
                            ?: throw IllegalArgumentException("fileName is required")
                        result.success(prepareDownload(fileName).absolutePath)
                    }
                    "startUpdateDownload" -> {
                        val url = call.argument<String>("url")
                            ?: throw IllegalArgumentException("url is required")
                        val fileName = call.argument<String>("fileName")
                            ?: throw IllegalArgumentException("fileName is required")
                        val versionCode = call.argument<Number>("versionCode")?.toLong()
                            ?: throw IllegalArgumentException("versionCode is required")
                        result.success(startUpdateDownload(url, fileName, versionCode))
                    }
                    "getUpdateDownload" -> {
                        result.success(getUpdateDownload())
                    }
                    "discardUpdateDownload" -> {
                        discardUpdateDownload()
                        result.success(null)
                    }
                    "sha256" -> {
                        val path = call.argument<String>("path")
                            ?: throw IllegalArgumentException("path is required")
                        val file = approvedUpdateFile(path)
                        Thread {
                            try {
                                val hash = sha256(file)
                                runOnUiThread { result.success(hash) }
                            } catch (error: Throwable) {
                                runOnUiThread {
                                    result.error(
                                        "APP_UPDATE_FAILED",
                                        error.message ?: "Cannot verify update",
                                        null,
                                    )
                                }
                            }
                        }.start()
                    }
                    "canInstallPackages" -> {
                        result.success(packageManager.canRequestPackageInstalls())
                    }
                    "openInstallSettings" -> {
                        openInstallSettings()
                        result.success(null)
                    }
                    "installApk" -> {
                        val path = call.argument<String>("path")
                            ?: throw IllegalArgumentException("path is required")
                        installApk(approvedUpdateFile(path))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            } catch (error: Throwable) {
                result.error(
                    "APP_UPDATE_FAILED",
                    error.message ?: "Android update operation failed",
                    null,
                )
            }
        }
    }

    private fun getAppInfo(): Map<String, Any> {
        val packageInfo = packageManager.getPackageInfo(packageName, 0)
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
        }
        return mapOf(
            "versionName" to (packageInfo.versionName ?: ""),
            "versionCode" to versionCode,
        )
    }

    private fun prepareDownload(rawFileName: String): File {
        val fileName = rawFileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        require(fileName.endsWith(".apk")) { "Update file must be an APK" }
        val directory = getExternalFilesDir("updates")
            ?: File(filesDir, "updates")
        check(directory.exists() || directory.mkdirs()) {
            "Cannot create updates directory"
        }
        return File(directory, fileName).apply {
            require(canonicalPath.startsWith(directory.canonicalPath)) {
                "Update file is outside the updates directory"
            }
        }
    }

    private fun startUpdateDownload(
        rawUrl: String,
        rawFileName: String,
        versionCode: Long,
    ): Map<String, Any?> {
        val uri = Uri.parse(rawUrl)
        require(uri.scheme == "http" || uri.scheme == "https") {
            "Update URL must use HTTP or HTTPS"
        }
        require(versionCode > 0) { "versionCode must be positive" }

        val file = prepareDownload(rawFileName)
        val preferences = getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
        val existingId = preferences.getLong(DOWNLOAD_ID, -1L)
        val existingUrl = preferences.getString(DOWNLOAD_URL, null)
        val existingVersion = preferences.getLong(DOWNLOAD_VERSION, -1L)
        if (existingId >= 0 && existingUrl == rawUrl && existingVersion == versionCode) {
            val existing = queryDownload(existingId, file)
            if (existing != null && existing["status"] != "failed") {
                return existing
            }
        }

        if (existingId >= 0) {
            downloadManager().remove(existingId)
        }
        if (file.exists() && !file.delete()) {
            throw IllegalStateException("Cannot remove previous update")
        }

        val request = DownloadManager.Request(uri)
            .setTitle("Такси Бгр")
            .setDescription("Загрузка обновления")
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
            .setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
            )
            .setDestinationUri(Uri.fromFile(file))

        val downloadId = downloadManager().enqueue(request)
        preferences.edit()
            .putLong(DOWNLOAD_ID, downloadId)
            .putString(DOWNLOAD_URL, rawUrl)
            .putLong(DOWNLOAD_VERSION, versionCode)
            .putString(DOWNLOAD_PATH, file.absolutePath)
            .apply()

        return queryDownload(downloadId, file)
            ?: mapOf(
                "status" to "pending",
                "downloadedBytes" to 0L,
                "totalBytes" to -1L,
                "path" to file.absolutePath,
            )
    }

    private fun getUpdateDownload(): Map<String, Any?> {
        val preferences = getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
        val downloadId = preferences.getLong(DOWNLOAD_ID, -1L)
        val path = preferences.getString(DOWNLOAD_PATH, null)
        if (downloadId < 0 || path.isNullOrBlank()) {
            return mapOf("status" to "missing")
        }
        return queryDownload(downloadId, File(path))
            ?: mapOf("status" to "missing")
    }

    private fun queryDownload(downloadId: Long, file: File): Map<String, Any?>? {
        val query = DownloadManager.Query().setFilterById(downloadId)
        downloadManager().query(query)?.use { cursor ->
            if (!cursor.moveToFirst()) {
                return null
            }
            val status = cursor.getInt(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS),
            )
            val downloadedBytes = cursor.getLong(
                cursor.getColumnIndexOrThrow(
                    DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR,
                ),
            )
            val totalBytes = cursor.getLong(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
            )
            val reason = cursor.getInt(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON),
            )
            return mapOf(
                "status" to when (status) {
                    DownloadManager.STATUS_PENDING -> "pending"
                    DownloadManager.STATUS_RUNNING -> "running"
                    DownloadManager.STATUS_PAUSED -> "paused"
                    DownloadManager.STATUS_SUCCESSFUL -> "successful"
                    DownloadManager.STATUS_FAILED -> "failed"
                    else -> "missing"
                },
                "downloadedBytes" to downloadedBytes,
                "totalBytes" to totalBytes,
                "reason" to reason,
                "path" to file.absolutePath,
            )
        }
        return null
    }

    private fun discardUpdateDownload() {
        val preferences = getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
        val downloadId = preferences.getLong(DOWNLOAD_ID, -1L)
        val path = preferences.getString(DOWNLOAD_PATH, null)
        if (downloadId >= 0) {
            downloadManager().remove(downloadId)
        }
        if (!path.isNullOrBlank()) {
            File(path).delete()
        }
        preferences.edit().clear().apply()
    }

    private fun downloadManager(): DownloadManager {
        return getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    private fun approvedUpdateFile(rawPath: String): File {
        val file = File(rawPath).canonicalFile
        val externalDirectory = getExternalFilesDir("updates")?.canonicalFile
        val internalDirectory = File(filesDir, "updates").canonicalFile
        val allowed = listOfNotNull(externalDirectory, internalDirectory).any {
            file.path.startsWith("${it.path}${File.separator}")
        }
        require(allowed && file.name.endsWith(".apk") && file.isFile) {
            "Update file is outside the approved directory"
        }
        return file
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun openInstallSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:$packageName"),
        )
        startActivity(intent)
    }

    private fun installApk(file: File) {
        check(packageManager.canRequestPackageInstalls()) {
            "Install permission is required"
        }
        val uri = FileProvider.getUriForFile(
            this,
            "$packageName.fileprovider",
            file,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            throw IllegalStateException("Package installer is unavailable")
        }
    }
}
