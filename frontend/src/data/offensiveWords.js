// Day 49: the built-in Hidden words list (Instagram's "hide offensive
// words"). Loaded with import() only for people whose Hidden words mode
// isn't off, so it stays out of the first download. Whole words and
// phrases; utils/hiddenWords folds spelling tricks (stretched letters,
// a$$, Arabic letter forms and prefixes), so one form per word is enough.
// It only changes what the person who turned it on sees -- nobody is
// stopped from writing anything.
const EN = [
  // Profanity.
  'fuck', 'fucker', 'fuckers', 'fucking', 'fucked', 'motherfucker', 'motherfuckers', 'fck', 'fuk', 'stfu', 'gtfo',
  'shit', 'shits', 'shitty', 'bullshit', 'shithead', 'dipshit',
  'bitch', 'bitches', 'son of a bitch', 'bastard', 'bastards',
  'asshole', 'assholes', 'ass', 'arsehole', 'jackass', 'dumbass',
  'dick', 'dickhead', 'cock', 'cocksucker', 'prick', 'cunt', 'cunts', 'pussy', 'twat', 'wanker', 'tosser', 'bollocks',
  'whore', 'whores', 'slut', 'sluts', 'skank', 'hoe',
  // Slurs.
  'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'fags', 'dyke', 'tranny', 'retard', 'retards', 'retarded',
  'spic', 'chink', 'kike', 'wetback', 'raghead', 'towelhead', 'paki', 'coon', 'gook',
  // Telling someone to hurt themselves.
  'kill yourself', 'kys', 'go die'
];

const AR = [
  // Profanity and sexual insults.
  'شرموط', 'شرموطة', 'شراميط', 'عاهرة', 'عاهر', 'قحبة', 'قحاب', 'منيوك', 'منيوكة', 'متناك', 'متناكة', 'نيك', 'منيك',
  'زب', 'زبي', 'كس', 'كسمك', 'كس امك', 'كس اختك', 'طيز', 'خول', 'لوطي', 'عرص', 'معرص', 'ديوث', 'قواد', 'خرا', 'خراء',
  // Insults aimed at someone's family.
  'ابن الكلب', 'ابن الحرام', 'ابن القحبة', 'ابن الشرموطة', 'يلعن ابوك', 'يلعن امك', 'يلعن دينك', 'تفو عليك',
  // Telling someone to hurt themselves.
  'اقتل نفسك', 'روح موت'
];

export default [...EN, ...AR];
