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
    scheduled_failed: "Your scheduled post couldn't be published. It's back in your drafts."
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
    scheduled_failed: 'تعذّر نشر منشورك المجدول. أُعيد إلى مسوداتك.'
  }
};

function pushText(language, key, values) {
  const table = TEXT[language] || TEXT.en;
  const template = table[key] || TEXT.en[key];
  if (!template) throw new Error(`No push text for ${key}`);
  return template.replace(/\{(\w+)\}/g, (whole, name) => (values[name] !== undefined ? String(values[name]) : whole));
}

module.exports = { pushText, PUSH_TEXT: TEXT };
