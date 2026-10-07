// Day 43: the server's limits (postController, commentController,
// messageService, profileController), so a composer stops at the limit instead of the server
// refusing the text after it was typed.
export const MAX_POST_LENGTH = 10000;
export const MAX_COMMENT_LENGTH = 5000;
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_BIO_LENGTH = 500;
