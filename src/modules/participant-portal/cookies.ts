const OTP_EMAIL_COOKIE_PREFIX = "participant_portal_otp_email_";

export function otpEmailCookieName(studyCode: string): string {
  return `${OTP_EMAIL_COOKIE_PREFIX}${studyCode}`;
}
