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
    group_message: '{name} sent a message in {group}'
  },
  my: {
    like: '{name} က သင့်ပို့စ်ကို လိုက်ခ်လုပ်ခဲ့သည်',
    comment: '{name} က သင့်ပို့စ်တွင် မှတ်ချက်ပေးခဲ့သည်',
    reply: '{name} က သင့်မှတ်ချက်ကို ပြန်ဖြေခဲ့သည်',
    comment_like: '{name} က သင့်မှတ်ချက်ကို လိုက်ခ်လုပ်ခဲ့သည်',
    mention_post: '{name} က ပို့စ်တစ်ခုတွင် သင့်ကို ဖော်ပြခဲ့သည်',
    mention_comment: '{name} က မှတ်ချက်တစ်ခုတွင် သင့်ကို ဖော်ပြခဲ့သည်',
    follow: '{name} က သင့်ကို စတင် ဖော်လိုးခဲ့သည်',
    follow_request: '{name} က သင့်ကို ဖော်လိုးရန် တောင်းဆိုခဲ့သည်',
    follow_accepted: '{name} က သင့် ဖော်လိုး တောင်းဆိုချက်ကို လက်ခံခဲ့သည်',
    message: '{name} က သင့်ထံ မက်ဆေ့ချ် ပို့ခဲ့သည်',
    group_message: '{name} က {group} တွင် မက်ဆေ့ချ် ပို့ခဲ့သည်'
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
    group_message: 'أرسل {name} رسالة في {group}'
  }
};

function pushText(language, key, values) {
  const table = TEXT[language] || TEXT.en;
  const template = table[key] || TEXT.en[key];
  if (!template) throw new Error(`No push text for ${key}`);
  return template.replace(/\{(\w+)\}/g, (whole, name) => (values[name] !== undefined ? String(values[name]) : whole));
}

module.exports = { pushText, PUSH_TEXT: TEXT };
