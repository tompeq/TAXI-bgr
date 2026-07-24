package ru.taxibgr.app

import android.content.ActivityNotFoundException
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
            if (exists() && !delete()) {
                throw IllegalStateException("Cannot replace previous update")
            }
        }
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
