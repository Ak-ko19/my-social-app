// Day 22: push notification text, in the recipient's app language
// (users.language, Day 16). Same wording as the app's own notification list
// (frontend i18n "notifications.types"). Message pushes never include the
// message itself: they show on lock screens.
const TEXT = {
  en: {
    like: '{name} liked your post',
    comment: '{name} commented on your post',
    reply: '{name} replied to your comment',
    comment_like: '{name} liked your comment',
    mention_post: '{name} mentioned you in a post',
    mention_comment: '{name} mentioned you in a comment',
    follow: '{name} started following you',
    follow_request: '{name} requested to follow you',
    follow_accepted: '{name} accepted your follow request',
    message: '{name} sent you a message',
    group_message: '{name} sent a message in {group}',
    // Day 45: about your own scheduled post (no one else's name).
    scheduled_post: 'Your scheduled post was published',
    scheduled_failed: "Your scheduled post couldn't be published. It's back in your drafts.",
    poll_ended: "{name}'s poll has ended. See the results.",
    poll_ended_own: 'Your poll has ended. See the results.',
    // Day 50.
    group_request: '{name} asked to join {group}',
    group_approved: "You're now a member of {group}",
    // Day 53.
    page_admin: '{name} made you an admin of {page}',
    // Day 55: the reminder goes about an hour before (the server doesn't
    // know the recipient's time zone, so no clock time here).
    event_reminder: '{event} starts in about an hour',
    event_cancelled: '{name} cancelled {event}'
  },
  ar: {
    like: 'أعجب {name} بمنشورك',
    comment: 'علّق {name} على منشورك',
    reply: 'ردّ {name} على تعليقك',
    comment_like: 'أعجب {name} بتعليقك',
    mention_post: 'أشار إليك {name} في منشور',
    mention_comment: 'أشار إليك {name} في تعليق',
    follow: 'بدأ {name} بمتابعتك',
    follow_request: 'طلب {name} متابعتك',
    follow_accepted: 'قبل {name} طلب متابعتك',
    message: 'أرسل إليك {name} رسالة',
    group_message: 'أرسل {name} رسالة في {group}',
    scheduled_post: 'نُشر منشورك المجدول',
    scheduled_failed: 'تعذّر نشر منشورك المجدول. أُعيد إلى مسوداتك.',
    poll_ended: 'انتهى استطلاع {name}. اطّلع على النتائج.',
    poll_ended_own: 'انتهى استطلاعك. اطّلع على النتائج.',
    group_request: 'طلب {name} الانضمام إلى {group}',
    group_approved: 'أصبحت عضوًا في {group}',
    page_admin: 'جعلك {name} مشرفًا على {page}',
    event_reminder: 'يبدأ {event} بعد ساعة تقريبًا',
    event_cancelled: 'ألغى {name} {event}'
  }
};

function pushText(language, key, values) {
  const table = TEXT[language] || TEXT.en;
  const template = table[key] || TEXT.en[key];
  if (!template) throw new Error(`No push text for ${key}`);
  return template.replace(/\{(\w+)\}/g, (whole, name) => (values[name] !== undefined ? String(values[name]) : whole));
}

module.exports = { pushText, PUSH_TEXT: TEXT };
