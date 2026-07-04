// Bible reading plans for the 31-day challenge
// Full Bible: ~1,189 chapters in 31 days
// New Testament: 260 chapters in 31 days
// Time estimates based on ~3.5 min per chapter average reading speed

var READING_PLANS = {
  "full-bible": [
    { day: 1,  reading: "Genesis",                           chapters: "Genesis 1\u201350",                          time: "~3 hrs", pace: "big" },
    { day: 2,  reading: "Exodus",                            chapters: "Exodus 1\u201340",                            time: "~2.5 hrs", pace: "big" },
    { day: 3,  reading: "Leviticus",                         chapters: "Leviticus 1\u201327",                         time: "~1.5 hrs", pace: "medium" },
    { day: 4,  reading: "Numbers",                           chapters: "Numbers 1\u201336",                           time: "~2 hrs", pace: "big" },
    { day: 5,  reading: "Deuteronomy",                       chapters: "Deuteronomy 1\u201334",                       time: "~2 hrs", pace: "medium" },
    { day: 6,  reading: "Joshua",                            chapters: "Joshua 1\u201324",                            time: "~1.5 hrs", pace: "medium" },
    { day: 7,  reading: "Judges, Ruth",                      chapters: "Judges 1\u201321, Ruth 1\u20134",             time: "~1.5 hrs", pace: "medium" },
    { day: 8,  reading: "1 Samuel",                          chapters: "1 Samuel 1\u201331",                          time: "~2 hrs", pace: "medium" },
    { day: 9,  reading: "2 Samuel",                          chapters: "2 Samuel 1\u201324",                          time: "~1.5 hrs", pace: "medium" },
    { day: 10, reading: "1 Kings",                           chapters: "1 Kings 1\u201322",                           time: "~1.5 hrs", pace: "medium" },
    { day: 11, reading: "2 Kings",                           chapters: "2 Kings 1\u201325",                           time: "~1.5 hrs", pace: "medium" },
    { day: 12, reading: "1 Chronicles",                      chapters: "1 Chronicles 1\u201329",                      time: "~1.5 hrs", pace: "medium" },
    { day: 13, reading: "2 Chronicles",                      chapters: "2 Chronicles 1\u201336",                      time: "~2 hrs", pace: "big" },
    { day: 14, reading: "Ezra, Nehemiah, Esther",            chapters: "Ezra 1\u201310, Nehemiah 1\u201313, Esther 1\u201310", time: "~2 hrs", pace: "medium" },
    { day: 15, reading: "Job",                               chapters: "Job 1\u201342",                               time: "~2 hrs", pace: "big" },
    { day: 16, reading: "Psalms 1\u201350",                  chapters: "Psalms 1\u201350",                            time: "~1.5 hrs", pace: "medium" },
    { day: 17, reading: "Psalms 51\u2013100",                chapters: "Psalms 51\u2013100",                          time: "~1.5 hrs", pace: "medium" },
    { day: 18, reading: "Psalms 101\u2013150",               chapters: "Psalms 101\u2013150",                         time: "~1.5 hrs", pace: "medium" },
    { day: 19, reading: "Proverbs, Ecclesiastes, Song of Solomon", chapters: "Proverbs 1\u201331, Ecclesiastes 1\u201312, Song of Solomon 1\u20138", time: "~2 hrs", pace: "big" },
    { day: 20, reading: "Isaiah 1\u201333",                  chapters: "Isaiah 1\u201333",                            time: "~2 hrs", pace: "big" },
    { day: 21, reading: "Isaiah 34\u201366",                 chapters: "Isaiah 34\u201366",                           time: "~2 hrs", pace: "big" },
    { day: 22, reading: "Jeremiah 1\u201326",                chapters: "Jeremiah 1\u201326",                          time: "~1.5 hrs", pace: "medium" },
    { day: 23, reading: "Jeremiah 27\u201352, Lamentations", chapters: "Jeremiah 27\u201352, Lamentations 1\u20135",  time: "~2 hrs", pace: "big" },
    { day: 24, reading: "Ezekiel, Daniel",                   chapters: "Ezekiel 1\u201348, Daniel 1\u201312",         time: "~3 hrs", pace: "big" },
    { day: 25, reading: "Hosea \u2013 Malachi",              chapters: "Hosea 1\u201314, Joel 1\u20133, Amos 1\u20139, Obadiah 1, Jonah 1\u20134, Micah 1\u20137, Nahum 1\u20133, Habakkuk 1\u20133, Zephaniah 1\u20133, Haggai 1\u20132, Zechariah 1\u201314, Malachi 1\u20134", time: "~2.5 hrs", pace: "big" },
    { day: 26, reading: "Matthew, Mark",                     chapters: "Matthew 1\u201328, Mark 1\u201316",           time: "~2.5 hrs", pace: "big" },
    { day: 27, reading: "Luke, John",                        chapters: "Luke 1\u201324, John 1\u201321",              time: "~2.5 hrs", pace: "big" },
    { day: 28, reading: "Acts, Romans",                      chapters: "Acts 1\u201328, Romans 1\u201316",            time: "~2.5 hrs", pace: "big" },
    { day: 29, reading: "1 Corinthians \u2013 Colossians",   chapters: "1 Corinthians 1\u201316, 2 Corinthians 1\u201313, Galatians 1\u20136, Ephesians 1\u20136, Philippians 1\u20134, Colossians 1\u20134", time: "~2 hrs", pace: "big" },
    { day: 30, reading: "1 Thessalonians \u2013 Hebrews",    chapters: "1 Thessalonians 1\u20135, 2 Thessalonians 1\u20133, 1 Timothy 1\u20136, 2 Timothy 1\u20134, Titus 1\u20133, Philemon 1, Hebrews 1\u201313", time: "~1.5 hrs", pace: "medium" },
    { day: 31, reading: "James \u2013 Revelation",           chapters: "James 1\u20135, 1 Peter 1\u20135, 2 Peter 1\u20133, 1 John 1\u20135, 2 John 1, 3 John 1, Jude 1, Revelation 1\u201322", time: "~2 hrs", pace: "big" }
  ],
  "new-testament": [
    { day: 1,  reading: "Matthew 1\u20139",                  chapters: "Matthew 1\u20139",                 time: "~30 min", pace: "light" },
    { day: 2,  reading: "Matthew 10\u201318",                chapters: "Matthew 10\u201318",               time: "~30 min", pace: "light" },
    { day: 3,  reading: "Matthew 19\u201328",                chapters: "Matthew 19\u201328",               time: "~35 min", pace: "light" },
    { day: 4,  reading: "Mark 1\u20138",                     chapters: "Mark 1\u20138",                    time: "~25 min", pace: "light" },
    { day: 5,  reading: "Mark 9\u201316",                    chapters: "Mark 9\u201316",                   time: "~25 min", pace: "light" },
    { day: 6,  reading: "Luke 1\u20136",                     chapters: "Luke 1\u20136",                    time: "~25 min", pace: "light" },
    { day: 7,  reading: "Luke 7\u201312",                    chapters: "Luke 7\u201312",                   time: "~25 min", pace: "light" },
    { day: 8,  reading: "Luke 13\u201318",                   chapters: "Luke 13\u201318",                  time: "~20 min", pace: "light" },
    { day: 9,  reading: "Luke 19\u201324",                   chapters: "Luke 19\u201324",                  time: "~25 min", pace: "light" },
    { day: 10, reading: "John 1\u20137",                     chapters: "John 1\u20137",                    time: "~25 min", pace: "light" },
    { day: 11, reading: "John 8\u201314",                    chapters: "John 8\u201314",                   time: "~25 min", pace: "light" },
    { day: 12, reading: "John 15\u201321",                   chapters: "John 15\u201321",                  time: "~25 min", pace: "light" },
    { day: 13, reading: "Acts 1\u20137",                     chapters: "Acts 1\u20137",                    time: "~25 min", pace: "light" },
    { day: 14, reading: "Acts 8\u201314",                    chapters: "Acts 8\u201314",                   time: "~25 min", pace: "light" },
    { day: 15, reading: "Acts 15\u201321",                   chapters: "Acts 15\u201321",                  time: "~25 min", pace: "light" },
    { day: 16, reading: "Acts 22\u201328",                   chapters: "Acts 22\u201328",                  time: "~25 min", pace: "light" },
    { day: 17, reading: "Romans 1\u20138",                   chapters: "Romans 1\u20138",                  time: "~30 min", pace: "light" },
    { day: 18, reading: "Romans 9\u201316",                  chapters: "Romans 9\u201316",                 time: "~30 min", pace: "light" },
    { day: 19, reading: "1 Corinthians 1\u20138",            chapters: "1 Corinthians 1\u20138",           time: "~30 min", pace: "light" },
    { day: 20, reading: "1 Corinthians 9\u201316",           chapters: "1 Corinthians 9\u201316",          time: "~30 min", pace: "light" },
    { day: 21, reading: "2 Corinthians 1\u20137",            chapters: "2 Corinthians 1\u20137",           time: "~25 min", pace: "light" },
    { day: 22, reading: "2 Corinthians 8\u201313, Galatians", chapters: "2 Corinthians 8\u201313, Galatians 1\u20136", time: "~35 min", pace: "medium" },
    { day: 23, reading: "Ephesians, Philippians, Colossians", chapters: "Ephesians 1\u20136, Philippians 1\u20134, Colossians 1\u20134", time: "~35 min", pace: "medium" },
    { day: 24, reading: "1\u20132 Thessalonians, 1 Timothy", chapters: "1 Thessalonians 1\u20135, 2 Thessalonians 1\u20133, 1 Timothy 1\u20136", time: "~35 min", pace: "medium" },
    { day: 25, reading: "2 Timothy, Titus, Philemon",        chapters: "2 Timothy 1\u20134, Titus 1\u20133, Philemon",  time: "~20 min", pace: "light" },
    { day: 26, reading: "Hebrews",                           chapters: "Hebrews 1\u201313",                time: "~40 min", pace: "medium" },
    { day: 27, reading: "James, 1 Peter, 2 Peter",           chapters: "James 1\u20135, 1 Peter 1\u20135, 2 Peter 1\u20133", time: "~35 min", pace: "medium" },
    { day: 28, reading: "1\u20133 John, Jude",               chapters: "1 John 1\u20135, 2 John, 3 John, Jude",  time: "~25 min", pace: "light" },
    { day: 29, reading: "Revelation 1\u20138",               chapters: "Revelation 1\u20138",              time: "~25 min", pace: "light" },
    { day: 30, reading: "Revelation 9\u201316",              chapters: "Revelation 9\u201316",             time: "~25 min", pace: "light" },
    { day: 31, reading: "Revelation 17\u201322",             chapters: "Revelation 17\u201322",            time: "~20 min", pace: "light" }
  ]
};

// Milestone messages
var MILESTONES = {
  7:  { badge: "1 WEEK", message: "One full week. You showed up seven days in a row. Most people never make it this far." },
  14: { badge: "2 WEEKS", message: "Two weeks done. You are halfway through. Do not stop now." },
  21: { badge: "3 WEEKS", message: "Three weeks. You are in the home stretch. Ten more days." },
  31: { badge: "COMPLETE", message: "You did it. 31 days. Your certificate is ready." }
};
