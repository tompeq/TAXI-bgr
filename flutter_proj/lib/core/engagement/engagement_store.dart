import '../auth/auth_controller.dart';
import '../network/api_exception.dart';
import 'engagement_api_client.dart';
import 'engagement_models.dart';

class EngagementStore {
  EngagementStore({required this.api, required this.auth});

  final EngagementApiClient api;
  final AuthController auth;
  final Set<String> _submittedRatingOrderIds = <String>{};

  bool get isLocalDevelopment =>
      auth.session?.accessToken.startsWith('local-dev-') ?? false;

  Future<List<OrderChatMessage>> orderMessages(String orderId) {
    if (isLocalDevelopment) {
      return Future.value(const []);
    }
    return auth.authorizedRequest((token) => api.orderMessages(token, orderId));
  }

  Future<OrderChatMessage?> sendOrderMessage(String orderId, String message) {
    if (isLocalDevelopment) {
      return Future.value(null);
    }
    return auth.authorizedRequest(
      (token) => api.sendOrderMessage(token, orderId, message),
    );
  }

  Future<EngagementInbox> loadInbox() async {
    if (isLocalDevelopment) {
      return const EngagementInbox(announcements: [], surveys: [], ratings: []);
    }
    final results = await Future.wait<Object>([
      auth.authorizedRequest(api.pendingAnnouncements),
      auth.authorizedRequest(api.dueSurveys),
      auth.authorizedRequest(api.pendingRatings),
    ]);
    final ratings = results[2] as List<PendingRating>;
    return EngagementInbox(
      announcements: results[0] as List<UserAnnouncement>,
      surveys: results[1] as List<EngagementSurvey>,
      ratings: ratings
          .where((rating) => !_submittedRatingOrderIds.contains(rating.orderId))
          .toList(growable: false),
    );
  }

  Future<void> acknowledgeAnnouncement(String id) {
    if (isLocalDevelopment) return Future.value();
    return auth.authorizedRequest(
      (token) => api.acknowledgeAnnouncement(token, id),
    );
  }

  Future<void> submitSurvey(String id, {String? answer, String? comment}) {
    if (isLocalDevelopment) return Future.value();
    return auth.authorizedRequest(
      (token) => api.submitSurvey(token, id, answer: answer, comment: comment),
    );
  }

  Future<void> submitRating(
    String orderId,
    int score, {
    String? comment,
  }) async {
    if (isLocalDevelopment) return;
    try {
      await auth.authorizedRequest(
        (token) => api.submitRating(token, orderId, score, comment: comment),
      );
    } on ApiException catch (error) {
      if (error.code != 'ORDER_ALREADY_RATED') {
        rethrow;
      }
    }
    _submittedRatingOrderIds.add(orderId);
  }
}
