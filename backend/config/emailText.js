// Account emails in the person's app language (users.language: 'en' or
// 'ar'; NULL or anything else = English). Plain text, so an Arabic email
// reads right-to-left in every mail app without any markup.
const TEXT = {
  en: {
    verify: {
      subject: 'Verify your MySocialApp email',
      text: 'Verify your email: {link}\n\nThis link expires in 24 hours. If you did not sign up for MySocialApp, you can ignore this email.'
    },
    reset: {
      subject: 'Reset your MySocialApp password',
      text: 'Reset link: {link}\n\nThis link expires in 1 hour. If you did not ask to reset your password, you can ignore this email.'
    },
    // Day 77: a login on a kind of device the account hasn't used lately.
    newLogin: {
      subject: 'New login to your MySocialApp account',
      text: 'Your account was just logged in to from {device} ({time} UTC).\n\nIf this was you, there is nothing to do.\nIf it was not, change your password now and log out the devices you do not recognise: {link}'
    },
    // Day 77: two-factor authentication turned on / off.
    twoFactorOn: {
      subject: 'Two-factor authentication is on for your MySocialApp account',
      text: 'Two-factor authentication was just turned on for your account. From now on, logging in also needs a code from your authenticator app.\n\nKeep your recovery codes somewhere safe: they let you in if you lose your phone.\nIf you did not do this, change your password now.'
    },
    twoFactorOff: {
      subject: 'Two-factor authentication was turned off on your MySocialApp account',
      text: 'Two-factor authentication was just turned off for your account. Logging in now needs only your password.\n\nIf you did not do this, change your password now and turn two-factor authentication back on in Settings.'
    }
  },
  ar: {
    verify: {
      subject: 'تأكيد بريدك الإلكتروني في MySocialApp',
      text: 'أكّد بريدك الإلكتروني: {link}\n\nتنتهي صلاحية هذا الرابط خلال 24 ساعة. إذا لم تنشئ حسابًا في MySocialApp، يمكنك تجاهل هذه الرسالة.'
    },
    reset: {
      subject: 'إعادة تعيين كلمة مرور MySocialApp',
      text: 'رابط إعادة التعيين: {link}\n\nتنتهي صلاحية هذا الرابط خلال ساعة واحدة. إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.'
    },
    newLogin: {
      subject: 'تسجيل دخول جديد إلى حسابك في MySocialApp',
      text: 'سُجّل الدخول إلى حسابك للتو من {device} ({time} بتوقيت UTC).\n\nإذا كان هذا أنت، فلا داعي لفعل أي شيء.\nوإن لم يكن، فغيّر كلمة المرور الآن وسجّل الخروج من الأجهزة التي لا تعرفها: {link}'
    },
    twoFactorOn: {
      subject: 'تم تفعيل المصادقة الثنائية لحسابك في MySocialApp',
      text: 'تم للتو تفعيل المصادقة الثنائية لحسابك. من الآن فصاعدًا، يحتاج تسجيل الدخول أيضًا إلى رمز من تطبيق المصادقة.\n\nاحفظ رموز الاسترداد في مكان آمن: فهي تتيح لك الدخول إذا فقدت هاتفك.\nإذا لم تفعل ذلك بنفسك، فغيّر كلمة المرور الآن.'
    },
    twoFactorOff: {
      subject: 'تم إيقاف المصادقة الثنائية في حسابك على MySocialApp',
      text: 'تم للتو إيقاف المصادقة الثنائية لحسابك. أصبح تسجيل الدخول يحتاج إلى كلمة المرور فقط.\n\nإذا لم تفعل ذلك بنفسك، فغيّر كلمة المرور الآن وأعد تفعيل المصادقة الثنائية من الإعدادات.'
    }
  }
};

// emailText('ar', 'reset', { link }) -> { subject, text }
function emailText(language, key, values) {
  const template = (TEXT[language] || TEXT.en)[key];
  if (!template) throw new Error(`No email text for ${key}`);
  return {
    subject: template.subject,
    text: template.text.replace(/\{(\w+)\}/g, (whole, name) => (values[name] !== undefined ? String(values[name]) : whole))
  };
}

module.exports = { emailText, EMAIL_TEXT: TEXT };
