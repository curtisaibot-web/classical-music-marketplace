import {
  db,
  usersTable,
  teacherProfilesTable,
  studentProfilesTable,
  listingsTable,
  masterclassEventsTable,
  digitalProductsTable,
  bookingsTable,
  ordersTable,
  reviewsTable,
  seoLandingPagesTable,
} from "@workspace/db";

async function seed() {
  console.log("🌱 Seeding database...");

  // ── Users ─────────────────────────────────────────────────────────────────
  const teachers = await db
    .insert(usersTable)
    .values([
      { id: "seed_teacher_1", email: "sofia.chen@example.com", firstName: "Sofia", lastName: "Chen", role: "teacher" },
      { id: "seed_teacher_2", email: "james.okafor@example.com", firstName: "James", lastName: "Okafor", role: "teacher" },
      { id: "seed_teacher_3", email: "elena.vasquez@example.com", firstName: "Elena", lastName: "Vasquez", role: "teacher" },
      { id: "seed_teacher_4", email: "luca.ferrari@example.com", firstName: "Luca", lastName: "Ferrari", role: "teacher" },
      { id: "seed_teacher_5", email: "amara.diallo@example.com", firstName: "Amara", lastName: "Diallo", role: "teacher" },
      { id: "seed_teacher_6", email: "hiroshi.tanaka@example.com", firstName: "Hiroshi", lastName: "Tanaka", role: "teacher" },
      { id: "seed_teacher_7", email: "claire.dupont@example.com", firstName: "Claire", lastName: "Dupont", role: "teacher" },
      { id: "seed_teacher_8", email: "mikhail.petrov@example.com", firstName: "Mikhail", lastName: "Petrov", role: "teacher" },
    ])
    .onConflictDoNothing()
    .returning();

  const students = await db
    .insert(usersTable)
    .values([
      { id: "seed_student_1", email: "alice.johnson@example.com", firstName: "Alice", lastName: "Johnson", role: "student" },
      { id: "seed_student_2", email: "ben.kowalski@example.com", firstName: "Ben", lastName: "Kowalski", role: "student" },
      { id: "seed_student_3", email: "maya.patel@example.com", firstName: "Maya", lastName: "Patel", role: "student" },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${8} teachers, ${3} students`);

  // ── Teacher Profiles ─────────────────────────────────────────────────────
  await db
    .insert(teacherProfilesTable)
    .values([
      {
        userId: "seed_teacher_1",
        bio: "Award-winning pianist with 15+ years teaching experience. Former principal pianist at the Shanghai Symphony Orchestra, Sofia brings a rare combination of technical precision and emotional depth to every lesson. Her students have gone on to win regional and national competitions.",
        instruments: ["piano", "harpsichord"],
        genres: ["classical", "romantic", "baroque"],
        city: "New York",
        country: "US",
        timezone: "America/New_York",
        hourlyRate: 15000,
        yearsExperience: 15,
        education: "Juilliard School, MM Performance",
        averageRating: 490,
        reviewCount: 47,
        isVerified: true,
        profileImageUrl: "/images/teachers/sofia_chen.png",
      },
      {
        userId: "seed_teacher_2",
        bio: "Concert violinist and passionate educator who has performed at Carnegie Hall, Royal Albert Hall, and the Berliner Philharmonie. James specialises in advanced technique and orchestral audition preparation, with a warm and encouraging teaching style.",
        instruments: ["violin", "viola"],
        genres: ["classical", "contemporary", "jazz"],
        city: "London",
        country: "GB",
        timezone: "Europe/London",
        hourlyRate: 12000,
        yearsExperience: 12,
        education: "Royal Academy of Music, BMus (First Class Honours)",
        averageRating: 480,
        reviewCount: 31,
        isVerified: true,
        profileImageUrl: "/images/teachers/james_okafor.png",
      },
      {
        userId: "seed_teacher_3",
        bio: "Classically trained cellist and music educator with a warmth and patience that helps students of all ages discover their musicality. Elena has performed with the Barcelona Symphony Orchestra and teaches students from beginner through conservatoire-entry level.",
        instruments: ["cello", "piano"],
        genres: ["classical", "baroque", "folk"],
        city: "Barcelona",
        country: "ES",
        timezone: "Europe/Madrid",
        hourlyRate: 8000,
        yearsExperience: 10,
        education: "Conservatori Superior de Música del Liceu, Barcelona",
        averageRating: 470,
        reviewCount: 22,
        isVerified: false,
        profileImageUrl: "/images/teachers/elena_vasquez.png",
      },
      {
        userId: "seed_teacher_4",
        bio: "Professional guitarist with 18 years of expertise in both classical and contemporary styles. Studio and live performer who has collaborated with orchestras across Europe and South America. Luca teaches technique, repertoire, and flamenco rhythm to students of all levels.",
        instruments: ["guitar", "lute"],
        genres: ["classical", "flamenco", "contemporary"],
        city: "Rome",
        country: "IT",
        timezone: "Europe/Rome",
        hourlyRate: 9000,
        yearsExperience: 18,
        education: "Conservatorio di Santa Cecilia, Rome",
        averageRating: 460,
        reviewCount: 19,
        isVerified: true,
        profileImageUrl: "/images/teachers/luca_ferrari.png",
      },
      {
        userId: "seed_teacher_5",
        bio: "Soprano soloist and voice teacher with a career spanning the world's leading opera houses. Amara specialises in operatic technique, breath support, and stage presence. She teaches in French, English, and Italian, and her students perform at major conservatoires and opera competitions.",
        instruments: ["voice"],
        genres: ["opera", "classical", "art song"],
        city: "Paris",
        country: "FR",
        timezone: "Europe/Paris",
        hourlyRate: 11000,
        yearsExperience: 14,
        education: "Conservatoire National Supérieur de Musique de Paris",
        averageRating: 500,
        reviewCount: 38,
        isVerified: true,
        profileImageUrl: "/images/teachers/amara_diallo.png",
      },
      {
        userId: "seed_teacher_6",
        bio: "Master flutist trained at elite institutions in Tokyo and Berlin. With 20 years of orchestral and chamber music experience, Hiroshi is an expert in orchestral audition preparation, tone development, and contemporary extended techniques for advanced players.",
        instruments: ["flute", "piccolo"],
        genres: ["classical", "contemporary", "chamber music"],
        city: "Tokyo",
        country: "JP",
        timezone: "Asia/Tokyo",
        hourlyRate: 10000,
        yearsExperience: 20,
        education: "Tokyo University of the Arts; Hochschule für Musik, Berlin",
        averageRating: 475,
        reviewCount: 28,
        isVerified: true,
        profileImageUrl: "/images/teachers/hiroshi_tanaka.png",
      },
      {
        userId: "seed_teacher_7",
        bio: "Harpist for leading orchestras across Europe and in high demand for weddings, corporate galas, and private concerts. Claire brings elegance and versatility to every performance, and teaches students from beginner through advanced conservatoire level with grace and patience.",
        instruments: ["harp"],
        genres: ["classical", "celtic", "pop"],
        city: "Lyon",
        country: "FR",
        timezone: "Europe/Paris",
        hourlyRate: 13000,
        yearsExperience: 11,
        education: "Conservatoire National Supérieur de Musique de Lyon",
        averageRating: 490,
        reviewCount: 15,
        isVerified: false,
        profileImageUrl: "/images/teachers/claire_dupont.png",
      },
      {
        userId: "seed_teacher_8",
        bio: "Concert pianist, Chopin International Piano Competition laureate, and distinguished educator at the Universität für Musik Wien. Mikhail has recorded six acclaimed albums and performs regularly at the Vienna Musikverein and the Salzburg Festival. He accepts only a handful of private students each year.",
        instruments: ["piano"],
        genres: ["romantic", "classical", "contemporary"],
        city: "Vienna",
        country: "AT",
        timezone: "Europe/Vienna",
        hourlyRate: 20000,
        yearsExperience: 25,
        education: "Universität für Musik und darstellende Kunst Wien; Moscow Conservatory",
        averageRating: 500,
        reviewCount: 62,
        isVerified: true,
        profileImageUrl: "/images/teachers/mikhail_petrov.png",
      },
    ])
    .onConflictDoNothing();

  // ── Student Profiles ─────────────────────────────────────────────────────
  await db
    .insert(studentProfilesTable)
    .values([
      { userId: "seed_student_1", instruments: ["piano"], skillLevel: "beginner", city: "Boston", country: "US" },
      { userId: "seed_student_2", instruments: ["violin"], skillLevel: "intermediate", city: "Berlin", country: "DE" },
      { userId: "seed_student_3", instruments: ["voice"], skillLevel: "advanced", city: "Sydney", country: "AU" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Teacher & student profiles");

  // ── Listings ─────────────────────────────────────────────────────────────
  const listingRows = await db
    .insert(listingsTable)
    .values([
      // Lessons
      { teacherId: "seed_teacher_1", type: "lesson", title: "Piano Fundamentals for Beginners", description: "Learn proper technique, music theory basics, and your first pieces. Sofia's structured approach ensures rapid, confident progress.", instrument: "piano", skillLevel: "beginner", priceInCents: 15000, durationMinutes: 60, isOnline: true, tags: ["piano", "beginners", "technique"] },
      { teacherId: "seed_teacher_2", type: "lesson", title: "Advanced Violin Technique", description: "Master shifting, vibrato, and complex bow techniques with one of London's foremost violinists. Advanced repertoire selection included.", instrument: "violin", skillLevel: "advanced", priceInCents: 12000, durationMinutes: 45, isOnline: true, tags: ["violin", "advanced", "technique"] },
      { teacherId: "seed_teacher_5", type: "lesson", title: "Opera Voice & Technique", description: "Breath support, resonance placement, and Italian & German repertoire with a Conservatoire de Paris–trained soprano.", instrument: "voice", skillLevel: "intermediate", priceInCents: 11000, durationMinutes: 60, isOnline: false, city: "Paris", country: "FR", tags: ["voice", "opera", "singing"] },
      // Events
      { teacherId: "seed_teacher_7", type: "event", title: "Wedding & Event Harpist", description: "Solo harp performance for weddings, cocktail hours, and corporate events across France and beyond. Elegant, memorable, and professional.", instrument: "harp", skillLevel: "all", priceInCents: 80000, isOnline: false, city: "Lyon", country: "FR", tags: ["harp", "wedding", "corporate"] },
      { teacherId: "seed_teacher_4", type: "event", title: "Classical Guitar — Private Concerts", description: "Intimate classical and flamenco guitar performance for private gatherings, celebrations, and corporate events in Rome and across Europe.", instrument: "guitar", skillLevel: "all", priceInCents: 60000, isOnline: false, city: "Rome", country: "IT", tags: ["guitar", "events", "classical"] },
      // Masterclasses
      { teacherId: "seed_teacher_8", type: "masterclass", title: "Chopin Nocturnes: Interpretation & Style", description: "Deep dive into Chopin's nocturnes with score analysis, live coaching, and insight into 19th-century performance practice from a Chopin Competition laureate.", instrument: "piano", skillLevel: "advanced", priceInCents: 5000, durationMinutes: 120, isOnline: true, tags: ["piano", "chopin", "interpretation"] },
      { teacherId: "seed_teacher_1", type: "masterclass", title: "Piano Performance Anxiety Workshop", description: "Practical breathing, visualisation, and rehearsal techniques to manage nerves and perform confidently — on stage and in auditions.", instrument: "piano", skillLevel: "all", priceInCents: 3500, durationMinutes: 90, isOnline: true, tags: ["piano", "performance", "psychology"] },
      // Digital Products
      { teacherId: "seed_teacher_3", type: "digital_product", title: "Bach Cello Suite No.1 — Annotated Score", description: "Fully annotated PDF score with Elena's detailed fingering, bowing markings, and interpretive notes developed over 10 years of teaching.", instrument: "cello", skillLevel: "intermediate", priceInCents: 1299, isOnline: true, tags: ["cello", "bach", "sheet-music"] },
      { teacherId: "seed_teacher_6", type: "digital_product", title: "Flute Warm-Up Routine (30 Days)", description: "A structured 30-day warm-up program for intermediate and advanced flutists. Develops tone, technique, and flexibility systematically.", instrument: "flute", skillLevel: "intermediate", priceInCents: 2499, isOnline: true, tags: ["flute", "practice", "technique"] },
      { teacherId: "seed_teacher_8", type: "digital_product", title: "Competition Preparation Workbook", description: "Mikhail's 12-week plan for preparing for international piano competitions, with practice schedules, mental preparation guides, and repertoire advice.", instrument: "piano", skillLevel: "advanced", priceInCents: 3999, isOnline: true, tags: ["piano", "competition", "practice"] },
      { teacherId: "seed_teacher_5", type: "digital_product", title: "Italian Diction for Classical Singers", description: "Comprehensive guide to Italian pronunciation for classical singers — IPA phonetics, common pitfalls, and practice recordings.", instrument: "voice", skillLevel: "all", priceInCents: 1999, isOnline: true, tags: ["voice", "diction", "italian"] },
      { teacherId: "seed_teacher_2", type: "digital_product", title: "Orchestral Audition Guide for Strings", description: "Step-by-step guide for orchestral audition preparation — excerpt selection, practice strategies, mental preparation, and mock audition tips.", instrument: "violin", skillLevel: "advanced", priceInCents: 4999, isOnline: true, tags: ["violin", "audition", "orchestra"] },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${listingRows.length} listings`);

  if (listingRows.length === 0) {
    console.log("  ⚠ No new listings inserted (may already exist). Skipping dependent seeds.");
    return;
  }

  // Get listing IDs by type
  const masterclassListings = listingRows.filter((l) => l.type === "masterclass");
  const digitalListings = listingRows.filter((l) => l.type === "digital_product");

  // ── Masterclass Events ────────────────────────────────────────────────────
  const masterclassRows = await db
    .insert(masterclassEventsTable)
    .values([
      {
        listingId: masterclassListings[0].id,
        teacherId: "seed_teacher_8",
        title: "Chopin Nocturnes: Interpretation & Style",
        description: "Deep dive into Chopin's nocturnes with score analysis, live coaching, and insight into 19th-century performance practice from a Chopin Competition laureate.",
        scheduledAt: new Date("2026-06-15T14:00:00Z"),
        durationMinutes: 120,
        maxPerformers: 3,
        maxObservers: 30,
        performerPriceInCents: 8000,
        observerPriceInCents: 2500,
        instrument: "piano",
        registeredPerformers: 1,
        registeredObservers: 8,
        imageUrl: "/images/masterclasses/chopin_masterclass.png",
      },
      {
        listingId: masterclassListings[1]?.id ?? masterclassListings[0].id,
        teacherId: "seed_teacher_1",
        title: "Piano Performance Anxiety Workshop",
        description: "Practical breathing, visualisation, and rehearsal techniques to manage nerves and perform confidently — on stage and in auditions.",
        scheduledAt: new Date("2026-06-22T16:00:00Z"),
        durationMinutes: 90,
        maxPerformers: 5,
        maxObservers: 50,
        performerPriceInCents: 5000,
        observerPriceInCents: 1500,
        instrument: "piano",
        registeredPerformers: 2,
        registeredObservers: 14,
        imageUrl: "/images/masterclasses/performance_workshop.png",
      },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${masterclassRows.length} masterclass events`);

  // ── Digital Products ─────────────────────────────────────────────────────
  const productImageMap: Record<string, string> = {
    "Bach Cello Suite No.1 — Annotated Score": "/images/store/bach_cello_suite.png",
    "Flute Warm-Up Routine (30 Days)": "/images/store/flute_warmup.png",
    "Competition Preparation Workbook": "/images/store/competition_workbook.png",
    "Italian Diction for Classical Singers": "/images/store/italian_diction.png",
    "Orchestral Audition Guide for Strings": "/images/store/bach_cello_suite.png",
  };

  const productCategoryMap: Record<string, string> = {
    "Bach Cello Suite No.1 — Annotated Score": "sheet_music",
    "Flute Warm-Up Routine (30 Days)": "lesson_plan",
    "Competition Preparation Workbook": "lesson_plan",
    "Italian Diction for Classical Singers": "lesson_plan",
    "Orchestral Audition Guide for Strings": "lesson_plan",
  };

  await db
    .insert(digitalProductsTable)
    .values(
      digitalListings.map((l) => ({
        listingId: l.id,
        teacherId: l.teacherId,
        title: l.title,
        description: l.description ?? "",
        category: productCategoryMap[l.title] ?? "sheet_music",
        instrument: l.instrument ?? undefined,
        priceInCents: l.priceInCents,
        isPublished: true,
        previewUrl: productImageMap[l.title],
      })),
    )
    .onConflictDoNothing();

  console.log("  ✓ Digital products");

  // ── Bookings ──────────────────────────────────────────────────────────────
  const bookingRows = await db
    .insert(bookingsTable)
    .values([
      {
        studentId: "seed_student_1",
        teacherId: "seed_teacher_1",
        listingId: listingRows.find((l) => l.type === "lesson" && l.teacherId === "seed_teacher_1")?.id,
        type: "lesson",
        status: "completed",
        scheduledAt: new Date("2026-04-15T10:00:00Z"),
        durationMinutes: 60,
        priceInCents: 15000,
        platformFeeInCents: 2250,
        completedAt: new Date("2026-04-15T11:00:00Z"),
        instrument: "piano",
      },
      {
        studentId: "seed_student_2",
        teacherId: "seed_teacher_2",
        listingId: listingRows.find((l) => l.type === "lesson" && l.teacherId === "seed_teacher_2")?.id,
        type: "lesson",
        status: "confirmed",
        scheduledAt: new Date("2026-06-10T14:00:00Z"),
        durationMinutes: 45,
        priceInCents: 12000,
        platformFeeInCents: 1800,
        instrument: "violin",
      },
      {
        studentId: "seed_student_3",
        teacherId: "seed_teacher_7",
        listingId: listingRows.find((l) => l.type === "event" && l.teacherId === "seed_teacher_7")?.id,
        type: "event",
        status: "confirmed",
        priceInCents: 80000,
        platformFeeInCents: 12000,
        eventType: "wedding",
        eventDate: new Date("2026-08-20T15:00:00Z"),
        eventLocation: "Château de la Loire, France",
      },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${bookingRows.length} bookings`);

  // ── Reviews ───────────────────────────────────────────────────────────────
  if (bookingRows.length > 0) {
    await db
      .insert(reviewsTable)
      .values([
        {
          reviewerId: "seed_student_1",
          teacherId: "seed_teacher_1",
          bookingId: bookingRows[0]?.id,
          rating: 5,
          title: "Exceptional teacher!",
          body: "Sofia is incredibly patient and her teaching method is clear and structured. I made more progress in one month than I did in a year of self-study. She has a gift for explaining complex technique in a way that clicks immediately.",
        },
        {
          reviewerId: "seed_student_2",
          teacherId: "seed_teacher_2",
          rating: 5,
          title: "World-class musician and teacher",
          body: "James has a phenomenal ear for detail. He spotted and corrected bow technique issues I didn't even know I had. Within four lessons my tone quality improved dramatically. Highly recommend to any serious violinist.",
        },
        {
          reviewerId: "seed_student_3",
          teacherId: "seed_teacher_5",
          rating: 5,
          title: "Changed my approach to singing forever",
          body: "Amara's operatic technique guidance is second to none. Her passion for teaching is infectious and her knowledge of breath support transformed my voice completely. Every session is both challenging and inspiring.",
        },
        {
          reviewerId: "seed_student_1",
          teacherId: "seed_teacher_8",
          rating: 5,
          title: "A truly transformative masterclass",
          body: "Mikhail's masterclass was one of the most profound musical experiences of my life. The way he explains Chopin's phrasing and emotional depth opened my eyes to a whole new level of musicianship. Worth every penny.",
        },
        {
          reviewerId: "seed_student_2",
          teacherId: "seed_teacher_6",
          rating: 4,
          title: "Excellent warm-up program — highly structured",
          body: "The 30-day flute warm-up routine is meticulously designed and genuinely improved my tone quality and flexibility. Great detail in the explanations and easy to follow even for a busy musician.",
        },
      ])
      .onConflictDoNothing();

    console.log("  ✓ 5 reviews");
  }

  // ── SEO Landing Pages ─────────────────────────────────────────────────────
  await db
    .insert(seoLandingPagesTable)
    .values([
      {
        slug: "violin-teachers-london",
        instrument: "violin",
        city: "London",
        country: "GB",
        title: "Violin Teachers in London",
        description: "Find expert violin teachers in London. Private lessons for all levels.",
        introCopy: "Whether you're a complete beginner or an advanced student preparing for conservatoire auditions, London is home to some of the world's finest violin teachers. Browse verified instructors, read student reviews, and book your first lesson today.",
        isEnabled: true,
      },
      {
        slug: "piano-teachers-new-york",
        instrument: "piano",
        city: "New York",
        country: "US",
        title: "Piano Teachers in New York",
        description: "Discover top piano teachers in New York City. From classical technique to jazz — all levels welcome.",
        introCopy: "New York City's extraordinary musical landscape attracts world-class piano educators from every tradition. Find a teacher who matches your goals and schedule, and start your journey today.",
        isEnabled: true,
      },
      {
        slug: "online-classical-guitar-lessons",
        instrument: "guitar",
        city: null,
        country: null,
        title: "Online Classical Guitar Lessons",
        description: "Book online classical guitar lessons with professional concert guitarists. Study anywhere in the world.",
        introCopy: "Study classical and flamenco guitar from the comfort of your home with internationally-trained concert guitarists. All lessons are delivered via high-quality video call with flexible scheduling.",
        isEnabled: true,
      },
      {
        slug: "cello-teachers-barcelona",
        instrument: "cello",
        city: "Barcelona",
        country: "ES",
        title: "Cello Teachers in Barcelona",
        description: "Find experienced cello teachers in Barcelona. Private lessons for beginners to advanced students.",
        introCopy: "Barcelona is a vibrant hub for classical string education. Connect with conservatoire-trained cello instructors offering both in-person and online lessons.",
        isEnabled: true,
      },
      {
        slug: "opera-voice-lessons-paris",
        instrument: "voice",
        city: "Paris",
        country: "FR",
        title: "Opera & Voice Lessons in Paris",
        description: "Study opera and classical singing with Conservatoire de Paris–trained teachers in the City of Light.",
        introCopy: "Paris is one of the world's great centres for operatic training. Study bel canto, French mélodie, German lieder, and operatic repertoire with teachers at the highest level.",
        isEnabled: true,
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ SEO landing pages");
  console.log("✅ Seed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
