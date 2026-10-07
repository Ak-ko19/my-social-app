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
