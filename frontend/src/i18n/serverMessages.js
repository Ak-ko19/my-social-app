// B15: the API answers errors with plain English text (e.g. "Incorrect
// password"), which screens show as-is. In Myanmar mode, known messages are
// swapped for a translation here; anything not listed is shown in English
// rather than replaced by a vaguer generic message. Only messages a person
// can actually hit in the UI are listed -- developer-facing validation
// ("userIds must be an array") is left out on purpose.
const MY = {
  // auth & account
  'Email and password are required': 'အီးမေးလ်နှင့် စကားဝှက် လိုအပ်ပါသည်',
  'Email is required': 'အီးမေးလ် လိုအပ်ပါသည်',
  'Invalid email or password': 'အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားနေပါသည်',
  'Invalid email format': 'အီးမေးလ် ပုံစံ မမှန်ကန်ပါ',
  'Please enter a valid email address': 'မှန်ကန်သော အီးမေးလ်လိပ်စာ ထည့်ပါ',
  'Email or username already exists': 'ဤအီးမေးလ် သို့မဟုတ် အသုံးပြုသူအမည်ကို အသုံးပြုပြီးဖြစ်ပါသည်',
  'Username, email, and password are all required': 'အသုံးပြုသူအမည်၊ အီးမေးလ်နှင့် စကားဝှက် အားလုံး လိုအပ်ပါသည်',
  'Username and email are required': 'အသုံးပြုသူအမည်နှင့် အီးမေးလ် လိုအပ်ပါသည်',
  'Password must be between 8 and 72 characters long': 'စကားဝှက်သည် စာလုံး ၈ လုံးမှ ၇၂ လုံးအတွင်း ဖြစ်ရပါမည်',
  'New password is required': 'စကားဝှက်အသစ် လိုအပ်ပါသည်',
  'Current and new password are required': 'လက်ရှိစကားဝှက်နှင့် စကားဝှက်အသစ် လိုအပ်ပါသည်',
  'Current password is incorrect': 'လက်ရှိစကားဝှက် မှားနေပါသည်',
  'Incorrect password': 'စကားဝှက် မှားနေပါသည်',
  'Password changed successfully': 'စကားဝှက် ပြောင်းပြီးပါပြီ',
  'Password reset successfully': 'စကားဝှက် ပြန်လည်သတ်မှတ်ပြီးပါပြီ',
  'Password is required to deactivate your account': 'အကောင့်ကို ယာယီပိတ်ရန် စကားဝှက် လိုအပ်ပါသည်',
  'Password is required to delete your account': 'အကောင့်ကို ဖျက်ရန် စကားဝှက် လိုအပ်ပါသည်',
  'If that email exists, a password reset link has been sent': 'ထိုအီးမေးလ် ရှိပါက စကားဝှက် ပြန်သတ်မှတ်ရန် လင့်ခ်ကို ပို့ပြီးပါပြီ',
  'Link expired or invalid': 'လင့်ခ် သက်တမ်းကုန်သွားပါပြီ သို့မဟုတ် မမှန်ကန်ပါ',
  'Invalid or expired token': 'လင့်ခ် သက်တမ်းကုန်သွားပါပြီ သို့မဟုတ် မမှန်ကန်ပါ',
  'Verification email sent': 'အတည်ပြု အီးမေးလ် ပို့ပြီးပါပြီ',
  'Your email is already verified': 'သင့်အီးမေးလ်ကို အတည်ပြုပြီးဖြစ်ပါသည်',
  'Email verified successfully': 'အီးမေးလ် အတည်ပြုပြီးပါပြီ',
  'This account has been banned': 'ဤအကောင့်ကို ပိတ်ပင်ထားပါသည်',
  'This account is private': 'ဤအကောင့်သည် သီးသန့်အကောင့် ဖြစ်ပါသည်',
  'User not found': 'အသုံးပြုသူ မတွေ့ပါ',
  // rate limits
  'Too many login attempts. Please try again in 15 minutes.': 'ဝင်ရောက်ရန် ကြိုးစားမှု များလွန်းပါသည်။ မိနစ် ၁၅ ကြာပြီးမှ ထပ်စမ်းကြည့်ပါ။',
  'Too many attempts. Please try again in 15 minutes.': 'ကြိုးစားမှု များလွန်းပါသည်။ မိနစ် ၁၅ ကြာပြီးမှ ထပ်စမ်းကြည့်ပါ။',
  'Too many password reset requests. Please try again in 15 minutes.': 'စကားဝှက် ပြန်သတ်မှတ်ရန် တောင်းဆိုမှု များလွန်းပါသည်။ မိနစ် ၁၅ ကြာပြီးမှ ထပ်စမ်းကြည့်ပါ။',
  'Too many verification emails requested. Please try again in 15 minutes.': 'အတည်ပြု အီးမေးလ် တောင်းဆိုမှု များလွန်းပါသည်။ မိနစ် ၁၅ ကြာပြီးမှ ထပ်စမ်းကြည့်ပါ။',
  'Too many accounts created from this network. Please try again later.': 'ဤကွန်ရက်မှ အကောင့် အများအပြား ဖွင့်ထားပြီးပါပြီ။ နောက်မှ ထပ်စမ်းကြည့်ပါ။',
  'Too many follow requests. Please try again later.': 'ဖော်လိုး တောင်းဆိုမှု များလွန်းပါသည်။ နောက်မှ ထပ်စမ်းကြည့်ပါ။',
  'Too many reports submitted. Please try again later.': 'တိုင်ကြားမှု များလွန်းပါသည်။ နောက်မှ ထပ်စမ်းကြည့်ပါ။',
  'Too many requests. Please try again later.': 'တောင်းဆိုမှု များလွန်းပါသည်။ နောက်မှ ထပ်စမ်းကြည့်ပါ။',
  // posts, comments, social
  'Post content cannot be empty': 'ပို့စ်တွင် စာသား ထည့်ရန် လိုအပ်ပါသည်',
  'Comment cannot be empty': 'မှတ်ချက်တွင် စာသား ထည့်ရန် လိုအပ်ပါသည်',
  'Post not found': 'ပို့စ် မတွေ့ပါ',
  'Comment not found': 'မှတ်ချက် မတွေ့ပါ',
  'Story not found': 'စတိုရီ မတွေ့ပါ',
  'A story needs an image': 'စတိုရီတွင် ပုံတစ်ပုံ လိုအပ်ပါသည်',
  'You can only edit your own posts': 'ကိုယ်ပိုင် ပို့စ်များကိုသာ ပြင်နိုင်ပါသည်',
  'You can only delete your own posts': 'ကိုယ်ပိုင် ပို့စ်များကိုသာ ဖျက်နိုင်ပါသည်',
  'You can only edit your own comments': 'ကိုယ်ပိုင် မှတ်ချက်များကိုသာ ပြင်နိုင်ပါသည်',
  'You can only delete your own comments': 'ကိုယ်ပိုင် မှတ်ချက်များကိုသာ ဖျက်နိုင်ပါသည်',
  'You cannot follow yourself': 'ကိုယ့်ကိုယ်ကို ဖော်လိုး မလုပ်နိုင်ပါ',
  'You cannot follow this user': 'ဤအသုံးပြုသူကို ဖော်လိုး မလုပ်နိုင်ပါ',
  'You cannot block yourself': 'ကိုယ့်ကိုယ်ကို ပိတ်၍ မရပါ',
  'You cannot message this user': 'ဤအသုံးပြုသူထံ မက်ဆေ့ချ် ပို့၍ မရပါ',
  'You cannot report yourself': 'ကိုယ့်ကိုယ်ကို တိုင်ကြား၍ မရပါ',
  'You cannot report your own post': 'ကိုယ်ပိုင် ပို့စ်ကို တိုင်ကြား၍ မရပါ',
  'You cannot start a conversation with yourself': 'ကိုယ့်ကိုယ်ကို မက်ဆေ့ချ် ပို့၍ မရပါ',
  'You are not a participant in this conversation': 'ဤစကားဝိုင်းတွင် သင် မပါဝင်ပါ',
  'Search query is required': 'ရှာဖွေရန် စာသား ထည့်ပါ',
  'Add at least one other person': 'အခြားလူ အနည်းဆုံး တစ်ယောက် ထည့်ပါ',
  'Choose at least one person to add': 'ထည့်ရန် လူ အနည်းဆုံး တစ်ယောက် ရွေးပါ',
  'Only group admins can add people': 'အဖွဲ့ စီမံသူများသာ လူထည့်နိုင်ပါသည်',
  'Only group admins can remove people': 'အဖွဲ့ စီမံသူများသာ လူဖယ်ရှားနိုင်ပါသည်',
  'Only group admins can rename the group': 'အဖွဲ့ စီမံသူများသာ အမည်ပြောင်းနိုင်ပါသည်',
  // B13 groups / B14 pages
  'A group needs a name': 'အဖွဲ့အမည် လိုအပ်ပါသည်',
  'Group name must be 100 characters or fewer': 'အဖွဲ့အမည်သည် စာလုံး ၁၀၀ ထက် မပိုရပါ',
  'Description must be 1000 characters or fewer': 'ဖော်ပြချက်သည် စာလုံး ၁၀၀၀ ထက် မပိုရပါ',
  'Group not found': 'အဖွဲ့ မတွေ့ပါ',
  'Join this group to post in it': 'ပို့စ်တင်ရန် ဤအဖွဲ့သို့ ဝင်ပါ',
  'Join this group to see its members': 'အဖွဲ့ဝင်များကို ကြည့်ရန် ဤအဖွဲ့သို့ ဝင်ပါ',
  'This group is private. Join to see its posts.': 'ဤအဖွဲ့သည် သီးသန့်အဖွဲ့ ဖြစ်ပါသည်။ ပို့စ်များကို ကြည့်ရန် ဝင်ပါ။',
  'Only group admins can do that': 'အဖွဲ့ စီမံသူများသာ ပြုလုပ်နိုင်ပါသည်',
  'That person is not in this group': 'ထိုသူသည် ဤအဖွဲ့တွင် မရှိပါ',
  'A page needs a name': 'စာမျက်နှာ အမည် လိုအပ်ပါသည်',
  'Page name must be 100 characters or fewer': 'စာမျက်နှာ အမည်သည် စာလုံး ၁၀၀ ထက် မပိုရပါ',
  'Page not found': 'စာမျက်နှာ မတွေ့ပါ',
  'Only the page owner can do that': 'စာမျက်နှာ ပိုင်ရှင်သာ ပြုလုပ်နိုင်ပါသည်',
  'Only the page owner can post as this page': 'စာမျက်နှာ ပိုင်ရှင်သာ ဤစာမျက်နှာအဖြစ် ပို့စ်တင်နိုင်ပါသည်',
  // generic
  'Server error': 'ဆာဗာ အမှား ဖြစ်ပေါ်ခဲ့ပါသည်',
  'Something went wrong. Please try again later.': 'တစ်ခုခု မှားယွင်းသွားပါသည်။ နောက်မှ ထပ်စမ်းကြည့်ပါ။',
  'Not found': 'မတွေ့ပါ'
};

// Every controller's 500 fallback reads "<Action> failed. Please try again later."
const MY_PATTERNS = [[/ failed\. Please try again later\.$/, 'လုပ်ဆောင်မှု မအောင်မြင်ပါ။ နောက်မှ ထပ်စမ်းကြည့်ပါ။']];

export function translateServerText(text, language) {
  if (language !== 'my' || typeof text !== 'string') return text;
  if (MY[text]) return MY[text];
  const pattern = MY_PATTERNS.find(([re]) => re.test(text));
  return pattern ? pattern[1] : text;
}
