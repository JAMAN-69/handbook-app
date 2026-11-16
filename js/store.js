// =============================================================================
// store.js — Data Store & localStorage Manager for Handbook
// =============================================================================

const Store = (() => {
  'use strict';

  const STORAGE_PREFIX = 'handbook_';
  const SESSION_KEY = 'handbook_session';
  const INIT_FLAG = 'handbook_initialized';

  // ---------------------------------------------------------------------------
  // Core localStorage helpers
  // ---------------------------------------------------------------------------
  function _save(collection, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + collection, JSON.stringify(data));
    } catch (e) {
      console.error(`[Store] Failed to save ${collection}:`, e);
    }
  }

  function _load(collection) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + collection);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(`[Store] Failed to load ${collection}:`, e);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function init() {
    if (!localStorage.getItem(INIT_FLAG)) {
      seedData();
      localStorage.setItem(INIT_FLAG, 'true');
      console.log('[Store] Initialized with seed data');
    } else {
      console.log('[Store] Loaded existing data');
    }
  }

  // ---------------------------------------------------------------------------
  // Generic CRUD
  // ---------------------------------------------------------------------------
  function getAll(collection) {
    return _load(collection);
  }

  function getById(collection, id) {
    const items = _load(collection);
    return items.find((item) => item.id === id) || null;
  }

  function add(collection, item) {
    const items = _load(collection);
    if (!item.id) {
      item.id = Utils.generateId();
    }
    items.push(item);
    _save(collection, items);
    return item;
  }

  function update(collection, id, updates) {
    const items = _load(collection);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates };
    _save(collection, items);
    return items[index];
  }

  function remove(collection, id) {
    const items = _load(collection);
    const filtered = items.filter((item) => item.id !== id);
    if (filtered.length === items.length) return false;
    _save(collection, filtered);
    return true;
  }

  function query(collection, filterFn) {
    const items = _load(collection);
    return items.filter(filterFn);
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------
  function setCurrentUser(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('[Store] Failed to save session:', e);
    }
  }

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // Refresh current user from users collection
  function refreshSession() {
    const current = getCurrentUser();
    if (current) {
      const fresh = getById('users', current.id);
      if (fresh) {
        setCurrentUser(fresh);
        return fresh;
      }
    }
    return current;
  }

  // ---------------------------------------------------------------------------
  // Reset (clear everything)
  // ---------------------------------------------------------------------------
  function reset() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(INIT_FLAG);
  }

  // ---------------------------------------------------------------------------
  // SEED DATA
  // ---------------------------------------------------------------------------
  function seedData() {
    const now = new Date();

    // Helper: generate a date N days ago with some random hours
    function daysAgo(d, hourOffset = 0) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(date.getHours() - hourOffset);
      return date.toISOString();
    }

    function hoursAgo(h) {
      const date = new Date(now);
      date.setHours(date.getHours() - h);
      return date.toISOString();
    }

    function minutesAgo(m) {
      const date = new Date(now);
      date.setMinutes(date.getMinutes() - m);
      return date.toISOString();
    }

    // =========================================================================
    // USERS (10 demo users)
    // =========================================================================
    const users = [
      {
        id: 'user-001',
        username: 'alexthompson',
        email: 'alex@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Alex Thompson',
        bio: 'Full-stack developer & coffee enthusiast ☕ | Building things that matter | San Francisco based 🌉',
        avatar: Utils.generateAvatarURL('Alex Thompson'),
        coverPhoto: '',
        location: 'San Francisco, CA',
        website: 'https://alexthompson.dev',
        joinedDate: daysAgo(420),
        isOnline: true,
        lastSeen: now.toISOString()
      },
      {
        id: 'user-002',
        username: 'sarahchen',
        email: 'sarah@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Sarah Chen',
        bio: 'UX Designer @TechCorp | Creating delightful experiences ✨ | Dog mom 🐕 | She/Her',
        avatar: Utils.generateAvatarURL('Sarah Chen'),
        coverPhoto: '',
        location: 'New York, NY',
        website: 'https://sarahchen.design',
        joinedDate: daysAgo(380),
        isOnline: true,
        lastSeen: minutesAgo(5)
      },
      {
        id: 'user-003',
        username: 'marcusjohnson',
        email: 'marcus@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Marcus Johnson',
        bio: 'Sports journalist | NBA & NFL analyst 🏀🏈 | Podcast host of "The Playbook" | Always courtside',
        avatar: Utils.generateAvatarURL('Marcus Johnson'),
        coverPhoto: '',
        location: 'Chicago, IL',
        website: 'https://theplaybook.fm',
        joinedDate: daysAgo(350),
        isOnline: false,
        lastSeen: hoursAgo(3)
      },
      {
        id: 'user-004',
        username: 'emmawilliams',
        email: 'emma@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Emma Williams',
        bio: 'Travel photographer 📸 | 40+ countries and counting 🌍 | Currently in Bali 🌺 | DM for collabs',
        avatar: Utils.generateAvatarURL('Emma Williams'),
        coverPhoto: '',
        location: 'Bali, Indonesia',
        website: 'https://emmawilliams.photo',
        joinedDate: daysAgo(310),
        isOnline: false,
        lastSeen: hoursAgo(8)
      },
      {
        id: 'user-005',
        username: 'rajpatel',
        email: 'raj@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Raj Patel',
        bio: 'Startup founder @NexGen AI 🚀 | Y Combinator W24 | Building the future of AI | Ex-Google',
        avatar: Utils.generateAvatarURL('Raj Patel'),
        coverPhoto: '',
        location: 'Austin, TX',
        website: 'https://nexgenai.co',
        joinedDate: daysAgo(280),
        isOnline: true,
        lastSeen: minutesAgo(15)
      },
      {
        id: 'user-006',
        username: 'lisaanderson',
        email: 'lisa@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Lisa Anderson',
        bio: 'Fitness coach & nutritionist 💪 | Helping you become your best self | 10K+ transformations | Book: "FitLife"',
        avatar: Utils.generateAvatarURL('Lisa Anderson'),
        coverPhoto: '',
        location: 'Los Angeles, CA',
        website: 'https://fitlife-lisa.com',
        joinedDate: daysAgo(260),
        isOnline: false,
        lastSeen: hoursAgo(1)
      },
      {
        id: 'user-007',
        username: 'davidkim',
        email: 'david@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'David Kim',
        bio: 'Music producer & songwriter 🎵 | Grammy nominated | Working with artists worldwide | New album dropping soon',
        avatar: Utils.generateAvatarURL('David Kim'),
        coverPhoto: '',
        location: 'Nashville, TN',
        website: 'https://davidkimmusic.com',
        joinedDate: daysAgo(240),
        isOnline: true,
        lastSeen: minutesAgo(30)
      },
      {
        id: 'user-008',
        username: 'oliviamartinez',
        email: 'olivia@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Olivia Martinez',
        bio: 'Bestselling author 📚 | Writing about love, loss & finding yourself | "The Last Chapter" out now | She/Her',
        avatar: Utils.generateAvatarURL('Olivia Martinez'),
        coverPhoto: '',
        location: 'Portland, OR',
        website: 'https://oliviamartinezbooks.com',
        joinedDate: daysAgo(200),
        isOnline: false,
        lastSeen: hoursAgo(6)
      },
      {
        id: 'user-009',
        username: 'jameswilson',
        email: 'james@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'James Wilson',
        bio: 'Chef & restaurant owner 🍳 | "Wilson\'s Kitchen" — NYC | Farm-to-table everything | Food is love',
        avatar: Utils.generateAvatarURL('James Wilson'),
        coverPhoto: '',
        location: 'Brooklyn, NY',
        website: 'https://wilsonskitchen.nyc',
        joinedDate: daysAgo(180),
        isOnline: true,
        lastSeen: minutesAgo(45)
      },
      {
        id: 'user-010',
        username: 'miarodriguez',
        email: 'mia@handbook.demo',
        password: Utils.hashPassword('demo123'),
        fullName: 'Mia Rodriguez',
        bio: 'Environmental scientist 🌱 | Fighting climate change one research paper at a time | Surfer 🏄‍♀️ | PhD candidate',
        avatar: Utils.generateAvatarURL('Mia Rodriguez'),
        coverPhoto: '',
        location: 'San Diego, CA',
        website: 'https://miarodriguez.science',
        joinedDate: daysAgo(150),
        isOnline: false,
        lastSeen: hoursAgo(2)
      }
    ];

    _save('users', users);

    // =========================================================================
    // POSTS (30 varied posts)
    // =========================================================================
    const posts = [
      {
        id: 'post-001',
        userId: 'user-001',
        content: 'Just shipped a major feature at work! 6 months of work finally paying off. The feeling when all tests pass on the first try is unmatched. 🚀\n\n#coding #webdev #javascript',
        images: [],
        hashtags: ['#coding', '#webdev', '#javascript'],
        createdAt: hoursAgo(2),
        likes: ['user-002', 'user-003', 'user-005', 'user-007', 'user-009'],
        shares: 3,
        bookmarks: ['user-002', 'user-005']
      },
      {
        id: 'post-002',
        userId: 'user-002',
        content: 'Design tip of the day: White space isn\'t empty space — it\'s breathing room for your content. Stop cramming everything together! Your users will thank you. 🎨\n\n#design #ux #uxdesign #designtips',
        images: [],
        hashtags: ['#design', '#ux', '#uxdesign', '#designtips'],
        createdAt: hoursAgo(5),
        likes: ['user-001', 'user-004', 'user-005', 'user-006', 'user-008', 'user-010'],
        shares: 12,
        bookmarks: ['user-001', 'user-004', 'user-010']
      },
      {
        id: 'post-003',
        userId: 'user-003',
        content: 'What a game last night! The fourth quarter comeback was absolutely insane. This is why we love basketball. That buzzer-beater will be replayed for years. 🏀🔥\n\n#NBA #basketball #gameday',
        images: [],
        hashtags: ['#nba', '#basketball', '#gameday'],
        createdAt: hoursAgo(8),
        likes: ['user-001', 'user-007', 'user-009'],
        shares: 5,
        bookmarks: []
      },
      {
        id: 'post-004',
        userId: 'user-004',
        content: 'Sunrise over the rice terraces in Bali this morning. Some moments remind you why you chose this life. No filter needed when nature is the artist. 🌅✨\n\n#travel #bali #photography #sunrise #wanderlust',
        images: [],
        hashtags: ['#travel', '#bali', '#photography', '#sunrise', '#wanderlust'],
        createdAt: hoursAgo(12),
        likes: ['user-001', 'user-002', 'user-003', 'user-005', 'user-006', 'user-007', 'user-008', 'user-009', 'user-010'],
        shares: 24,
        bookmarks: ['user-002', 'user-006', 'user-008']
      },
      {
        id: 'post-005',
        userId: 'user-005',
        content: 'Thrilled to announce that NexGen AI just closed our Series A! $15M to continue building the future of AI-powered workflows. Huge thanks to our amazing team and investors who believe in our vision. 🚀\n\nWe\'re hiring! Check the link in my bio.\n\n#startup #AI #funding #hiring',
        images: [],
        hashtags: ['#startup', '#ai', '#funding', '#hiring'],
        createdAt: daysAgo(1, 3),
        likes: ['user-001', 'user-002', 'user-003', 'user-004', 'user-006', 'user-007', 'user-008', 'user-009', 'user-010'],
        shares: 45,
        bookmarks: ['user-001', 'user-003', 'user-007']
      },
      {
        id: 'post-006',
        userId: 'user-006',
        content: 'Monday motivation: You don\'t have to be perfect. You just have to be consistent. Small steps every day add up to massive transformations.\n\nWho\'s hitting the gym today? 💪\n\n#fitness #motivation #gym #healthylifestyle',
        images: [],
        hashtags: ['#fitness', '#motivation', '#gym', '#healthylifestyle'],
        createdAt: daysAgo(1, 6),
        likes: ['user-001', 'user-003', 'user-004', 'user-009', 'user-010'],
        shares: 8,
        bookmarks: ['user-003', 'user-009']
      },
      {
        id: 'post-007',
        userId: 'user-007',
        content: 'Just finished recording the final track for the new album. 14 songs, 2 years in the making. Can\'t wait for you all to hear it. This one is special. 🎵🎶\n\n#music #newalbum #producer #songwriter',
        images: [],
        hashtags: ['#music', '#newalbum', '#producer', '#songwriter'],
        createdAt: daysAgo(1, 10),
        likes: ['user-001', 'user-002', 'user-004', 'user-006', 'user-008'],
        shares: 15,
        bookmarks: ['user-002', 'user-008']
      },
      {
        id: 'post-008',
        userId: 'user-008',
        content: '"The Last Chapter" just hit the NYT bestseller list for the third week in a row! I\'m genuinely speechless. Thank you to every single person who picked up a copy and shared their stories with me. You are the reason I write. 📚❤️\n\n#writing #books #bestseller #grateful',
        images: [],
        hashtags: ['#writing', '#books', '#bestseller', '#grateful'],
        createdAt: daysAgo(2, 2),
        likes: ['user-001', 'user-002', 'user-003', 'user-004', 'user-005', 'user-006', 'user-007', 'user-009', 'user-010'],
        shares: 32,
        bookmarks: ['user-002', 'user-004', 'user-006']
      },
      {
        id: 'post-009',
        userId: 'user-009',
        content: 'New dish on the menu tonight: Pan-seared duck breast with cherry reduction, roasted root vegetables, and a touch of truffle oil. Farm-to-table perfection. 🍽️\n\nReservations open for the weekend!\n\n#food #chef #farmtotable #nyceats #finedining',
        images: [],
        hashtags: ['#food', '#chef', '#farmtotable', '#nyceats', '#finedining'],
        createdAt: daysAgo(2, 8),
        likes: ['user-002', 'user-004', 'user-006', 'user-008'],
        shares: 7,
        bookmarks: ['user-002', 'user-006']
      },
      {
        id: 'post-010',
        userId: 'user-010',
        content: 'Our new paper on coral reef bleaching was just published in Nature! Two years of fieldwork across the Pacific. The data is clear — we need to act now, not tomorrow.\n\nLink to the paper in my bio.\n\n#science #climatechange #coralreefs #research #environment',
        images: [],
        hashtags: ['#science', '#climatechange', '#coralreefs', '#research', '#environment'],
        createdAt: daysAgo(2, 14),
        likes: ['user-001', 'user-002', 'user-004', 'user-005', 'user-008'],
        shares: 28,
        bookmarks: ['user-001', 'user-005', 'user-008']
      },
      {
        id: 'post-011',
        userId: 'user-001',
        content: 'Hot take: TypeScript isn\'t just "JavaScript with types." It fundamentally changes how you think about code architecture. Once you start designing with types first, there\'s no going back.\n\nAgree or disagree? 👇\n\n#typescript #javascript #programming #hottake',
        images: [],
        hashtags: ['#typescript', '#javascript', '#programming', '#hottake'],
        createdAt: daysAgo(3, 4),
        likes: ['user-002', 'user-005', 'user-007'],
        shares: 6,
        bookmarks: ['user-005']
      },
      {
        id: 'post-012',
        userId: 'user-002',
        content: 'Just wrapped up a user research session and WOW. The assumptions we had were so wrong. This is exactly why we test with real users. Never skip the research phase!\n\n#ux #userresearch #designthinking #productdesign',
        images: [],
        hashtags: ['#ux', '#userresearch', '#designthinking', '#productdesign'],
        createdAt: daysAgo(3, 9),
        likes: ['user-001', 'user-005', 'user-010'],
        shares: 4,
        bookmarks: ['user-001']
      },
      {
        id: 'post-013',
        userId: 'user-004',
        content: 'Packing my bags for Japan next week! Cherry blossom season is calling. Any recommendations for hidden gems in Kyoto? 🌸🇯🇵\n\n#japan #travel #cherryblossoms #kyoto #photography',
        images: [],
        hashtags: ['#japan', '#travel', '#cherryblossoms', '#kyoto', '#photography'],
        createdAt: daysAgo(4, 2),
        likes: ['user-001', 'user-002', 'user-003', 'user-006', 'user-008', 'user-009'],
        shares: 9,
        bookmarks: ['user-001', 'user-002', 'user-009']
      },
      {
        id: 'post-014',
        userId: 'user-003',
        content: 'The trade deadline never disappoints. Some of these moves are going to completely reshape the playoff picture. My full analysis will be on the podcast tomorrow morning.\n\nWho got the best deal? Drop your takes below. 🏀📊\n\n#NBA #tradedeadline #basketball #sports',
        images: [],
        hashtags: ['#nba', '#tradedeadline', '#basketball', '#sports'],
        createdAt: daysAgo(4, 7),
        likes: ['user-001', 'user-007', 'user-009'],
        shares: 11,
        bookmarks: []
      },
      {
        id: 'post-015',
        userId: 'user-005',
        content: 'The biggest mistake founders make isn\'t building the wrong product — it\'s building the right product for the wrong market. Market research isn\'t optional, it\'s survival.\n\nThread on the 5 market research frameworks that saved NexGen AI 🧵👇\n\n#startup #entrepreneurship #founder #advice',
        images: [],
        hashtags: ['#startup', '#entrepreneurship', '#founder', '#advice'],
        createdAt: daysAgo(5, 1),
        likes: ['user-001', 'user-002', 'user-003', 'user-008', 'user-010'],
        shares: 18,
        bookmarks: ['user-001', 'user-003', 'user-008']
      },
      {
        id: 'post-016',
        userId: 'user-006',
        content: 'Progress isn\'t always linear. Some weeks you crush it, some weeks you can barely get out of bed. Both are valid. What matters is that you keep going.\n\nSharing my client Sarah\'s incredible 12-month transformation story in tomorrow\'s newsletter. 📩\n\n#fitness #mentalhealth #transformation #keepgoing',
        images: [],
        hashtags: ['#fitness', '#mentalhealth', '#transformation', '#keepgoing'],
        createdAt: daysAgo(5, 11),
        likes: ['user-002', 'user-004', 'user-008', 'user-010'],
        shares: 6,
        bookmarks: ['user-002', 'user-010']
      },
      {
        id: 'post-017',
        userId: 'user-007',
        content: 'Collaboration is everything in music. Spent the day in the studio with @sarahchen — yes, she sings too! Something magical is coming. Stay tuned. 🎤🎹\n\n#music #collaboration #studio #comingsoon',
        images: [],
        hashtags: ['#music', '#collaboration', '#studio', '#comingsoon'],
        createdAt: daysAgo(6, 5),
        likes: ['user-002', 'user-001', 'user-004', 'user-006', 'user-008', 'user-009'],
        shares: 10,
        bookmarks: ['user-002']
      },
      {
        id: 'post-018',
        userId: 'user-009',
        content: 'There\'s something deeply meditative about making pasta from scratch. Just flour, eggs, and your hands. No machines, no shortcuts. Sometimes the old ways are the best ways. 🍝\n\n#cooking #pasta #homemade #cheflife #slowfood',
        images: [],
        hashtags: ['#cooking', '#pasta', '#homemade', '#cheflife', '#slowfood'],
        createdAt: daysAgo(6, 12),
        likes: ['user-002', 'user-004', 'user-006', 'user-008'],
        shares: 5,
        bookmarks: ['user-004', 'user-006']
      },
      {
        id: 'post-019',
        userId: 'user-008',
        content: 'Writing advice I wish someone had given me earlier:\n\n1. Write the messy first draft\n2. Let it sit for a week\n3. Edit ruthlessly\n4. Repeat step 3 five more times\n5. It\'s still not perfect, and that\'s okay\n\nThe hardest part isn\'t writing — it\'s letting go. 📝\n\n#writing #amwriting #writingcommunity #authorlife',
        images: [],
        hashtags: ['#writing', '#amwriting', '#writingcommunity', '#authorlife'],
        createdAt: daysAgo(7, 3),
        likes: ['user-001', 'user-002', 'user-004', 'user-005', 'user-010'],
        shares: 14,
        bookmarks: ['user-001', 'user-004', 'user-010']
      },
      {
        id: 'post-020',
        userId: 'user-010',
        content: 'Went surfing at dawn today before heading to the lab. There\'s nothing like saltwater and sunshine to clear your head before diving into data analysis. 🏄‍♀️🌊\n\nAlso spotted three dolphins! Best morning ever.\n\n#surfing #science #morningroutine #sandiego',
        images: [],
        hashtags: ['#surfing', '#science', '#morningroutine', '#sandiego'],
        createdAt: daysAgo(7, 9),
        likes: ['user-001', 'user-004', 'user-006'],
        shares: 2,
        bookmarks: []
      },
      {
        id: 'post-021',
        userId: 'user-001',
        content: 'Weekend project: Built a real-time collaborative whiteboard from scratch. WebSockets + Canvas API + a lot of coffee. Open-sourced it on GitHub!\n\nSometimes the best way to learn is to build something ridiculous. 😄\n\n#opensource #coding #sideproject #webdev',
        images: [],
        hashtags: ['#opensource', '#coding', '#sideproject', '#webdev'],
        createdAt: daysAgo(8, 2),
        likes: ['user-002', 'user-005', 'user-007', 'user-010'],
        shares: 8,
        bookmarks: ['user-005', 'user-010']
      },
      {
        id: 'post-022',
        userId: 'user-003',
        content: 'Just interviewed a rookie who could genuinely be the next big thing. Raw talent, incredible work ethic, and the most humble person you\'ll ever meet. Remember this name.\n\n#sports #nba #interview #basketball #rookie',
        images: [],
        hashtags: ['#sports', '#nba', '#interview', '#basketball', '#rookie'],
        createdAt: daysAgo(8, 8),
        likes: ['user-001', 'user-005', 'user-007', 'user-009'],
        shares: 6,
        bookmarks: ['user-007']
      },
      {
        id: 'post-023',
        userId: 'user-006',
        content: 'Recipe alert! 🥑\n\nHigh-protein avocado toast that actually keeps you full:\n- Sourdough bread\n- 1/2 avocado mashed\n- 2 poached eggs\n- Everything bagel seasoning\n- Red pepper flakes\n- Drizzle of olive oil\n\n450 cal, 28g protein. You\'re welcome. 💚\n\n#healthyfood #recipe #mealprep #protein',
        images: [],
        hashtags: ['#healthyfood', '#recipe', '#mealprep', '#protein'],
        createdAt: daysAgo(9, 5),
        likes: ['user-002', 'user-004', 'user-008', 'user-009', 'user-010'],
        shares: 19,
        bookmarks: ['user-002', 'user-004', 'user-008', 'user-009', 'user-010']
      },
      {
        id: 'post-024',
        userId: 'user-004',
        content: 'I\'ve been traveling for 3 years straight and here\'s what nobody tells you: it can be incredibly lonely. The Instagram version of travel is glamorous sunsets and perfect moments. The reality includes crying in airport bathrooms and missing your family.\n\nBut I wouldn\'t trade it for anything. Growth lives outside your comfort zone. 🌍❤️\n\n#travel #honesty #digitalnomad #solotraveler',
        images: [],
        hashtags: ['#travel', '#honesty', '#digitalnomad', '#solotraveler'],
        createdAt: daysAgo(10, 4),
        likes: ['user-001', 'user-002', 'user-003', 'user-005', 'user-006', 'user-007', 'user-008', 'user-009', 'user-010'],
        shares: 38,
        bookmarks: ['user-001', 'user-002', 'user-006', 'user-008']
      },
      {
        id: 'post-025',
        userId: 'user-005',
        content: 'Attending a founder meetup tonight in Austin. These informal gatherings are where the magic happens — where ideas collide and partnerships are born.\n\nIf you\'re in Austin, come say hi! 🤝\n\n#startup #austin #networking #founders',
        images: [],
        hashtags: ['#startup', '#austin', '#networking', '#founders'],
        createdAt: daysAgo(10, 15),
        likes: ['user-001', 'user-003'],
        shares: 2,
        bookmarks: []
      },
      {
        id: 'post-026',
        userId: 'user-007',
        content: 'Vinyl is NOT dead. Spent the afternoon crate-digging at a local record shop. Found an original pressing of Miles Davis "Kind of Blue." My hands are still shaking. 🎵💿\n\n#music #vinyl #jazz #milesdavis #cratedigging',
        images: [],
        hashtags: ['#music', '#vinyl', '#jazz', '#milesdavis', '#cratedigging'],
        createdAt: daysAgo(11, 6),
        likes: ['user-001', 'user-002', 'user-008', 'user-009'],
        shares: 4,
        bookmarks: ['user-001', 'user-008']
      },
      {
        id: 'post-027',
        userId: 'user-009',
        content: 'Hot take: The best restaurants in any city are the ones with no social media presence, handwritten menus, and a grumpy owner who\'s been cooking the same dish for 40 years.\n\nChange my mind. 🍜\n\n#food #restaurants #hottake #foodie',
        images: [],
        hashtags: ['#food', '#restaurants', '#hottake', '#foodie'],
        createdAt: daysAgo(12, 3),
        likes: ['user-001', 'user-002', 'user-003', 'user-004', 'user-006', 'user-008'],
        shares: 15,
        bookmarks: ['user-002', 'user-004']
      },
      {
        id: 'post-028',
        userId: 'user-010',
        content: 'Gave a TEDx talk today on ocean acidification. Spoke to 800 people about why our oceans matter. If even one person walks away caring more about the environment, it was worth every nervous minute on that stage. 🌊🎤\n\n#tedx #science #oceans #climateaction #publicspeaking',
        images: [],
        hashtags: ['#tedx', '#science', '#oceans', '#climateaction', '#publicspeaking'],
        createdAt: daysAgo(13, 7),
        likes: ['user-001', 'user-002', 'user-004', 'user-005', 'user-006', 'user-008'],
        shares: 22,
        bookmarks: ['user-001', 'user-005']
      },
      {
        id: 'post-029',
        userId: 'user-002',
        content: 'My desk setup evolution over the past 5 years: from a wobbly IKEA table to a standing desk with dual monitors. But honestly? Some of my best work was done on that wobbly table.\n\nThe gear doesn\'t make the designer. 🖥️\n\n#design #desksetup #workspace #minimalism',
        images: [],
        hashtags: ['#design', '#desksetup', '#workspace', '#minimalism'],
        createdAt: daysAgo(14, 2),
        likes: ['user-001', 'user-005', 'user-007', 'user-010'],
        shares: 3,
        bookmarks: ['user-001']
      },
      {
        id: 'post-030',
        userId: 'user-008',
        content: 'Reading list for this month:\n\n📖 "Demon Copperhead" by Barbara Kingsolver\n📖 "Tomorrow, and Tomorrow, and Tomorrow" by Gabrielle Zevin\n📖 "The Covenant of Water" by Abraham Verghese\n\nWhat\'s on your nightstand? Share your recs! 📚\n\n#books #reading #bookrecommendations #bookclub',
        images: [],
        hashtags: ['#books', '#reading', '#bookrecommendations', '#bookclub'],
        createdAt: daysAgo(15, 5),
        likes: ['user-001', 'user-002', 'user-004', 'user-010'],
        shares: 7,
        bookmarks: ['user-001', 'user-002', 'user-004']
      }
    ];

    _save('posts', posts);

    // =========================================================================
    // COMMENTS
    // =========================================================================
    const comments = [
      {
        id: 'comment-001',
        postId: 'post-001',
        userId: 'user-002',
        parentId: null,
        content: 'Congrats Alex! That feeling is pure magic. What stack are you working with?',
        createdAt: hoursAgo(1),
        likes: ['user-001', 'user-005']
      },
      {
        id: 'comment-002',
        postId: 'post-001',
        userId: 'user-001',
        parentId: 'comment-001',
        content: 'Thanks Sarah! React + Node.js + PostgreSQL. The usual suspects 😄',
        createdAt: minutesAgo(55),
        likes: ['user-002']
      },
      {
        id: 'comment-003',
        postId: 'post-001',
        userId: 'user-005',
        parentId: null,
        content: 'All tests passing on first try? Now that\'s suspicious... 😂 Kidding, great work!',
        createdAt: minutesAgo(45),
        likes: ['user-001', 'user-002', 'user-007']
      },
      {
        id: 'comment-004',
        postId: 'post-002',
        userId: 'user-001',
        parentId: null,
        content: 'This is SO true. As a developer, I\'m guilty of trying to cram every pixel. Your posts always remind me to step back.',
        createdAt: hoursAgo(4),
        likes: ['user-002', 'user-004']
      },
      {
        id: 'comment-005',
        postId: 'post-002',
        userId: 'user-010',
        parentId: null,
        content: 'Saving this for my next presentation. White space = respect for the viewer\'s eyes.',
        createdAt: hoursAgo(3),
        likes: ['user-002']
      },
      {
        id: 'comment-006',
        postId: 'post-004',
        userId: 'user-002',
        parentId: null,
        content: 'This is absolutely stunning, Emma. The golden hour light is perfect! 😍',
        createdAt: hoursAgo(11),
        likes: ['user-004', 'user-001']
      },
      {
        id: 'comment-007',
        postId: 'post-004',
        userId: 'user-006',
        parentId: null,
        content: 'Bali is on my bucket list! How long are you staying there?',
        createdAt: hoursAgo(10),
        likes: ['user-004']
      },
      {
        id: 'comment-008',
        postId: 'post-004',
        userId: 'user-004',
        parentId: 'comment-007',
        content: 'I\'ve been here for 2 months now! Extended my stay twice. It\'s hard to leave 🥺',
        createdAt: hoursAgo(9),
        likes: ['user-006', 'user-002']
      },
      {
        id: 'comment-009',
        postId: 'post-005',
        userId: 'user-001',
        parentId: null,
        content: 'Huge congrats Raj! 🎉 NexGen has been on fire. Well deserved.',
        createdAt: daysAgo(1, 2),
        likes: ['user-005']
      },
      {
        id: 'comment-010',
        postId: 'post-005',
        userId: 'user-002',
        parentId: null,
        content: 'Amazing milestone! Would love to chat about the UX of your AI tools sometime.',
        createdAt: daysAgo(1, 1),
        likes: ['user-005', 'user-001']
      },
      {
        id: 'comment-011',
        postId: 'post-008',
        userId: 'user-004',
        parentId: null,
        content: 'I just finished reading it and I literally cried on a plane. In front of strangers. No regrets. Incredible book, Olivia. 📚❤️',
        createdAt: daysAgo(2, 1),
        likes: ['user-008', 'user-002', 'user-001']
      },
      {
        id: 'comment-012',
        postId: 'post-008',
        userId: 'user-009',
        parentId: null,
        content: 'My wife read it in one sitting and then made ME read it. Now we\'re both emotional messes. Thank you for that! 😂📖',
        createdAt: daysAgo(1, 22),
        likes: ['user-008', 'user-002']
      },
      {
        id: 'comment-013',
        postId: 'post-010',
        userId: 'user-005',
        parentId: null,
        content: 'Groundbreaking research, Mia. This is the kind of work that changes policy. Shared with my entire network.',
        createdAt: daysAgo(2, 12),
        likes: ['user-010', 'user-001']
      },
      {
        id: 'comment-014',
        postId: 'post-013',
        userId: 'user-009',
        parentId: null,
        content: 'You HAVE to visit this tiny ramen shop in a Kyoto alley — I\'ll DM you the location. Changed my life.',
        createdAt: daysAgo(4, 1),
        likes: ['user-004', 'user-002']
      },
      {
        id: 'comment-015',
        postId: 'post-013',
        userId: 'user-002',
        parentId: null,
        content: 'The Fushimi Inari shrine at sunrise — no crowds, just magic. Trust me on this one! 🌸',
        createdAt: daysAgo(3, 20),
        likes: ['user-004', 'user-001']
      },
      {
        id: 'comment-016',
        postId: 'post-017',
        userId: 'user-002',
        parentId: null,
        content: 'Wait WHAT?! This is real?? I am SO excited!! 🎤✨',
        createdAt: daysAgo(6, 4),
        likes: ['user-007', 'user-001', 'user-004']
      },
      {
        id: 'comment-017',
        postId: 'post-023',
        userId: 'user-009',
        parentId: null,
        content: 'A chef\'s stamp of approval on this recipe! Add a tiny bit of lemon zest — game changer. 🍋',
        createdAt: daysAgo(9, 3),
        likes: ['user-006', 'user-002', 'user-004']
      },
      {
        id: 'comment-018',
        postId: 'post-024',
        userId: 'user-002',
        parentId: null,
        content: 'Thank you for being so honest about this, Emma. The vulnerability in this post is beautiful. ❤️',
        createdAt: daysAgo(10, 2),
        likes: ['user-004', 'user-001', 'user-008']
      },
      {
        id: 'comment-019',
        postId: 'post-024',
        userId: 'user-008',
        parentId: null,
        content: 'This hit different. I write about these feelings but you LIVE them. So much respect for your courage.',
        createdAt: daysAgo(10, 1),
        likes: ['user-004', 'user-002', 'user-001']
      },
      {
        id: 'comment-020',
        postId: 'post-027',
        userId: 'user-004',
        parentId: null,
        content: 'THIS. The best meal I\'ve ever had was at a no-name spot in Bangkok with plastic chairs. 10/10.',
        createdAt: daysAgo(12, 1),
        likes: ['user-009', 'user-002']
      },
      {
        id: 'comment-021',
        postId: 'post-011',
        userId: 'user-005',
        parentId: null,
        content: 'Completely agree. We migrated NexGen to TypeScript last year and the codebase quality improved dramatically.',
        createdAt: daysAgo(3, 2),
        likes: ['user-001']
      },
      {
        id: 'comment-022',
        postId: 'post-028',
        userId: 'user-001',
        parentId: null,
        content: 'Just watched the recording — absolutely powerful. You have a gift for making complex science accessible to everyone.',
        createdAt: daysAgo(13, 5),
        likes: ['user-010', 'user-002']
      },
      {
        id: 'comment-023',
        postId: 'post-030',
        userId: 'user-001',
        parentId: null,
        content: 'Currently reading "Tomorrow, and Tomorrow, and Tomorrow" — it\'s incredible! Great taste, Olivia.',
        createdAt: daysAgo(15, 3),
        likes: ['user-008']
      },
      {
        id: 'comment-024',
        postId: 'post-030',
        userId: 'user-004',
        parentId: null,
        content: 'Adding "The Covenant of Water" to my travel reading list! Thanks for the rec 📚',
        createdAt: daysAgo(15, 2),
        likes: ['user-008', 'user-002']
      }
    ];

    _save('comments', comments);

    // =========================================================================
    // FOLLOWS (relationships between users)
    // =========================================================================
    const follows = [
      // Alex follows many people
      { id: 'follow-001', followerId: 'user-001', followingId: 'user-002', createdAt: daysAgo(300) },
      { id: 'follow-002', followerId: 'user-001', followingId: 'user-003', createdAt: daysAgo(280) },
      { id: 'follow-003', followerId: 'user-001', followingId: 'user-004', createdAt: daysAgo(250) },
      { id: 'follow-004', followerId: 'user-001', followingId: 'user-005', createdAt: daysAgo(240) },
      { id: 'follow-005', followerId: 'user-001', followingId: 'user-007', createdAt: daysAgo(200) },
      { id: 'follow-006', followerId: 'user-001', followingId: 'user-008', createdAt: daysAgo(180) },
      { id: 'follow-007', followerId: 'user-001', followingId: 'user-010', createdAt: daysAgo(150) },
      // Sarah follows
      { id: 'follow-008', followerId: 'user-002', followingId: 'user-001', createdAt: daysAgo(290) },
      { id: 'follow-009', followerId: 'user-002', followingId: 'user-004', createdAt: daysAgo(270) },
      { id: 'follow-010', followerId: 'user-002', followingId: 'user-005', createdAt: daysAgo(260) },
      { id: 'follow-011', followerId: 'user-002', followingId: 'user-007', createdAt: daysAgo(230) },
      { id: 'follow-012', followerId: 'user-002', followingId: 'user-008', createdAt: daysAgo(200) },
      { id: 'follow-013', followerId: 'user-002', followingId: 'user-009', createdAt: daysAgo(180) },
      // Marcus follows
      { id: 'follow-014', followerId: 'user-003', followingId: 'user-001', createdAt: daysAgo(310) },
      { id: 'follow-015', followerId: 'user-003', followingId: 'user-007', createdAt: daysAgo(250) },
      { id: 'follow-016', followerId: 'user-003', followingId: 'user-009', createdAt: daysAgo(220) },
      // Emma follows
      { id: 'follow-017', followerId: 'user-004', followingId: 'user-001', createdAt: daysAgo(280) },
      { id: 'follow-018', followerId: 'user-004', followingId: 'user-002', createdAt: daysAgo(270) },
      { id: 'follow-019', followerId: 'user-004', followingId: 'user-006', createdAt: daysAgo(250) },
      { id: 'follow-020', followerId: 'user-004', followingId: 'user-008', createdAt: daysAgo(230) },
      { id: 'follow-021', followerId: 'user-004', followingId: 'user-009', createdAt: daysAgo(200) },
      // Raj follows
      { id: 'follow-022', followerId: 'user-005', followingId: 'user-001', createdAt: daysAgo(260) },
      { id: 'follow-023', followerId: 'user-005', followingId: 'user-002', createdAt: daysAgo(250) },
      { id: 'follow-024', followerId: 'user-005', followingId: 'user-010', createdAt: daysAgo(200) },
      // Lisa follows
      { id: 'follow-025', followerId: 'user-006', followingId: 'user-002', createdAt: daysAgo(240) },
      { id: 'follow-026', followerId: 'user-006', followingId: 'user-004', createdAt: daysAgo(230) },
      { id: 'follow-027', followerId: 'user-006', followingId: 'user-009', createdAt: daysAgo(200) },
      { id: 'follow-028', followerId: 'user-006', followingId: 'user-010', createdAt: daysAgo(180) },
      // David follows
      { id: 'follow-029', followerId: 'user-007', followingId: 'user-001', createdAt: daysAgo(220) },
      { id: 'follow-030', followerId: 'user-007', followingId: 'user-002', createdAt: daysAgo(210) },
      { id: 'follow-031', followerId: 'user-007', followingId: 'user-008', createdAt: daysAgo(190) },
      // Olivia follows
      { id: 'follow-032', followerId: 'user-008', followingId: 'user-001', createdAt: daysAgo(190) },
      { id: 'follow-033', followerId: 'user-008', followingId: 'user-002', createdAt: daysAgo(185) },
      { id: 'follow-034', followerId: 'user-008', followingId: 'user-004', createdAt: daysAgo(180) },
      { id: 'follow-035', followerId: 'user-008', followingId: 'user-010', createdAt: daysAgo(160) },
      // James follows
      { id: 'follow-036', followerId: 'user-009', followingId: 'user-002', createdAt: daysAgo(170) },
      { id: 'follow-037', followerId: 'user-009', followingId: 'user-004', createdAt: daysAgo(165) },
      { id: 'follow-038', followerId: 'user-009', followingId: 'user-006', createdAt: daysAgo(155) },
      // Mia follows
      { id: 'follow-039', followerId: 'user-010', followingId: 'user-001', createdAt: daysAgo(140) },
      { id: 'follow-040', followerId: 'user-010', followingId: 'user-004', createdAt: daysAgo(135) },
      { id: 'follow-041', followerId: 'user-010', followingId: 'user-005', createdAt: daysAgo(130) },
      { id: 'follow-042', followerId: 'user-010', followingId: 'user-008', createdAt: daysAgo(120) }
    ];

    _save('follows', follows);

    // =========================================================================
    // MESSAGES (sample conversations)
    // =========================================================================
    const messages = [
      // Conversation between Alex and Sarah
      { id: 'msg-001', senderId: 'user-001', receiverId: 'user-002', content: 'Hey Sarah! Love your latest design post. Would you be interested in collaborating on a UI project?', createdAt: daysAgo(3, 5), read: true },
      { id: 'msg-002', senderId: 'user-002', receiverId: 'user-001', content: 'Thanks Alex! I\'d love to! What kind of project are you thinking?', createdAt: daysAgo(3, 4), read: true },
      { id: 'msg-003', senderId: 'user-001', receiverId: 'user-002', content: 'I\'m building a social media dashboard. Need someone with your UX skills to make it amazing.', createdAt: daysAgo(3, 3), read: true },
      { id: 'msg-004', senderId: 'user-002', receiverId: 'user-001', content: 'That sounds right up my alley! Let\'s set up a call this week? 📞', createdAt: daysAgo(3, 2), read: true },
      { id: 'msg-005', senderId: 'user-001', receiverId: 'user-002', content: 'Perfect! How about Thursday at 2pm?', createdAt: daysAgo(2, 8), read: true },
      { id: 'msg-006', senderId: 'user-002', receiverId: 'user-001', content: 'Thursday works! I\'ll send you a calendar invite. Excited to work together! 🎉', createdAt: daysAgo(2, 7), read: false },

      // Conversation between Alex and Raj
      { id: 'msg-007', senderId: 'user-005', receiverId: 'user-001', content: 'Hey Alex, congrats on the feature launch! Saw your post — impressive work.', createdAt: daysAgo(1, 10), read: true },
      { id: 'msg-008', senderId: 'user-001', receiverId: 'user-005', content: 'Thanks Raj! And congrats on the Series A! That\'s huge! 🚀', createdAt: daysAgo(1, 9), read: true },
      { id: 'msg-009', senderId: 'user-005', receiverId: 'user-001', content: 'Thanks! Hey, we\'re actually looking for a senior full-stack dev. Interested?', createdAt: daysAgo(1, 8), read: true },
      { id: 'msg-010', senderId: 'user-001', receiverId: 'user-005', content: 'That\'s flattering! I\'m happy where I am right now, but let\'s definitely stay in touch. Maybe in the future!', createdAt: daysAgo(1, 7), read: false },

      // Conversation between Emma and Sarah
      { id: 'msg-011', senderId: 'user-004', receiverId: 'user-002', content: 'Sarah! Your desk setup post is goals. Where did you get that monitor arm?', createdAt: daysAgo(5, 3), read: true },
      { id: 'msg-012', senderId: 'user-002', receiverId: 'user-004', content: 'Hey Emma! It\'s the Ergotron LX — totally worth it. Your Bali photos are INSANE btw! 😍', createdAt: daysAgo(5, 2), read: true },
      { id: 'msg-013', senderId: 'user-004', receiverId: 'user-002', content: 'Aww thank you! You should come visit — Bali would look amazing through a designer\'s eyes!', createdAt: daysAgo(5, 1), read: true },

      // Conversation between David and Olivia
      { id: 'msg-014', senderId: 'user-007', receiverId: 'user-008', content: 'Olivia! Just finished "The Last Chapter." I\'m not crying, you\'re crying. 😭', createdAt: daysAgo(8, 4), read: true },
      { id: 'msg-015', senderId: 'user-008', receiverId: 'user-007', content: 'David!! That means so much coming from you. Music and writing — we deal in emotions, right? ❤️', createdAt: daysAgo(8, 3), read: true },
      { id: 'msg-016', senderId: 'user-007', receiverId: 'user-008', content: 'Absolutely. Hey — would you ever be interested in writing lyrics? I think we could make something special.', createdAt: daysAgo(8, 2), read: true },
      { id: 'msg-017', senderId: 'user-008', receiverId: 'user-007', content: 'I would LOVE that! Let\'s make it happen. 🎵📝', createdAt: daysAgo(8, 1), read: false },

      // Conversation between James and Lisa
      { id: 'msg-018', senderId: 'user-009', receiverId: 'user-006', content: 'Lisa, loved your avocado toast recipe! Pro tip: add a tiny bit of yuzu — trust me.', createdAt: daysAgo(4, 6), read: true },
      { id: 'msg-019', senderId: 'user-006', receiverId: 'user-009', content: 'James! Coming from a professional chef, that means everything! I\'ll try the yuzu tip tomorrow. 🍋', createdAt: daysAgo(4, 5), read: true },
      { id: 'msg-020', senderId: 'user-009', receiverId: 'user-006', content: 'You should come by the restaurant sometime — I\'ll make you a chef\'s tasting menu, healthy edition 😄', createdAt: daysAgo(4, 4), read: false }
    ];

    _save('messages', messages);

    // =========================================================================
    // NOTIFICATIONS
    // =========================================================================
    const notifications = [
      { id: 'notif-001', userId: 'user-001', fromUserId: 'user-002', type: 'like', postId: 'post-001', message: 'Sarah Chen liked your post', createdAt: hoursAgo(1), read: false },
      { id: 'notif-002', userId: 'user-001', fromUserId: 'user-005', type: 'like', postId: 'post-001', message: 'Raj Patel liked your post', createdAt: minutesAgo(45), read: false },
      { id: 'notif-003', userId: 'user-001', fromUserId: 'user-002', type: 'comment', postId: 'post-001', message: 'Sarah Chen commented on your post', createdAt: hoursAgo(1), read: false },
      { id: 'notif-004', userId: 'user-001', fromUserId: 'user-005', type: 'comment', postId: 'post-001', message: 'Raj Patel commented on your post', createdAt: minutesAgo(45), read: true },
      { id: 'notif-005', userId: 'user-001', fromUserId: 'user-010', type: 'follow', postId: null, message: 'Mia Rodriguez started following you', createdAt: daysAgo(1), read: true },
      { id: 'notif-006', userId: 'user-001', fromUserId: 'user-005', type: 'message', postId: null, message: 'Raj Patel sent you a message', createdAt: daysAgo(1, 10), read: true },
      { id: 'notif-007', userId: 'user-001', fromUserId: 'user-007', type: 'like', postId: 'post-001', message: 'David Kim liked your post', createdAt: hoursAgo(2), read: false },
      { id: 'notif-008', userId: 'user-001', fromUserId: 'user-009', type: 'like', postId: 'post-021', message: 'James Wilson liked your post', createdAt: daysAgo(7), read: true },

      { id: 'notif-009', userId: 'user-002', fromUserId: 'user-001', type: 'like', postId: 'post-002', message: 'Alex Thompson liked your post', createdAt: hoursAgo(4), read: false },
      { id: 'notif-010', userId: 'user-002', fromUserId: 'user-007', type: 'follow', postId: null, message: 'David Kim started following you', createdAt: daysAgo(2), read: true },
      { id: 'notif-011', userId: 'user-002', fromUserId: 'user-001', type: 'comment', postId: 'post-002', message: 'Alex Thompson commented on your post', createdAt: hoursAgo(4), read: false },
      { id: 'notif-012', userId: 'user-002', fromUserId: 'user-001', type: 'message', postId: null, message: 'Alex Thompson sent you a message', createdAt: daysAgo(3, 5), read: true },

      { id: 'notif-013', userId: 'user-004', fromUserId: 'user-001', type: 'like', postId: 'post-004', message: 'Alex Thompson liked your post', createdAt: hoursAgo(11), read: false },
      { id: 'notif-014', userId: 'user-004', fromUserId: 'user-002', type: 'comment', postId: 'post-004', message: 'Sarah Chen commented on your post', createdAt: hoursAgo(11), read: false },
      { id: 'notif-015', userId: 'user-004', fromUserId: 'user-009', type: 'comment', postId: 'post-013', message: 'James Wilson commented on your post', createdAt: daysAgo(4, 1), read: true },

      { id: 'notif-016', userId: 'user-005', fromUserId: 'user-001', type: 'like', postId: 'post-005', message: 'Alex Thompson liked your post', createdAt: daysAgo(1, 2), read: true },
      { id: 'notif-017', userId: 'user-005', fromUserId: 'user-001', type: 'comment', postId: 'post-005', message: 'Alex Thompson commented on your post', createdAt: daysAgo(1, 2), read: true },
      { id: 'notif-018', userId: 'user-005', fromUserId: 'user-010', type: 'follow', postId: null, message: 'Mia Rodriguez started following you', createdAt: daysAgo(5), read: true },

      { id: 'notif-019', userId: 'user-008', fromUserId: 'user-004', type: 'comment', postId: 'post-008', message: 'Emma Williams commented on your post', createdAt: daysAgo(2, 1), read: false },
      { id: 'notif-020', userId: 'user-008', fromUserId: 'user-007', type: 'message', postId: null, message: 'David Kim sent you a message', createdAt: daysAgo(8, 4), read: true },

      { id: 'notif-021', userId: 'user-010', fromUserId: 'user-005', type: 'comment', postId: 'post-010', message: 'Raj Patel commented on your post', createdAt: daysAgo(2, 12), read: true },
      { id: 'notif-022', userId: 'user-010', fromUserId: 'user-001', type: 'like', postId: 'post-010', message: 'Alex Thompson liked your post', createdAt: daysAgo(2, 13), read: true },

      { id: 'notif-023', userId: 'user-007', fromUserId: 'user-002', type: 'comment', postId: 'post-017', message: 'Sarah Chen commented on your post', createdAt: daysAgo(6, 4), read: false },
      { id: 'notif-024', userId: 'user-007', fromUserId: 'user-008', type: 'message', postId: null, message: 'Olivia Martinez sent you a message', createdAt: daysAgo(8, 1), read: true }
    ];

    _save('notifications', notifications);

    console.log('[Store] Seed data generated successfully');
    console.log(`  - ${users.length} users`);
    console.log(`  - ${posts.length} posts`);
    console.log(`  - ${comments.length} comments`);
    console.log(`  - ${follows.length} follows`);
    console.log(`  - ${messages.length} messages`);
    console.log(`  - ${notifications.length} notifications`);
  }

  // ---------------------------------------------------------------------------
  // Convenience query helpers
  // ---------------------------------------------------------------------------

  function getPostsByUser(userId) {
    return query('posts', (p) => p.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getCommentsByPost(postId) {
    return query('comments', (c) => c.postId === postId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function getFollowers(userId) {
    return query('follows', (f) => f.followingId === userId);
  }

  function getFollowing(userId) {
    return query('follows', (f) => f.followerId === userId);
  }

  function isFollowing(followerId, followingId) {
    return query('follows', (f) => f.followerId === followerId && f.followingId === followingId).length > 0;
  }

  function getConversation(userId1, userId2) {
    return query('messages', (m) =>
      (m.senderId === userId1 && m.receiverId === userId2) ||
      (m.senderId === userId2 && m.receiverId === userId1)
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function getUnreadNotifications(userId) {
    return query('notifications', (n) => n.userId === userId && !n.read);
  }

  function getUnreadMessageCount(userId) {
    return query('messages', (m) => m.receiverId === userId && !m.read).length;
  }

  function getFeed(userId) {
    // Get posts from people the user follows + own posts
    const following = getFollowing(userId).map((f) => f.followingId);
    following.push(userId); // Include own posts

    return query('posts', (p) => following.includes(p.userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init,
    getAll,
    getById,
    add,
    update,
    remove,
    query,
    setCurrentUser,
    getCurrentUser,
    clearSession,
    refreshSession,
    reset,
    seedData,
    // Convenience methods
    getPostsByUser,
    getCommentsByPost,
    getFollowers,
    getFollowing,
    isFollowing,
    getConversation,
    getUnreadNotifications,
    getUnreadMessageCount,
    getFeed
  };
})();

// Expose globally
window.Store = Store;
