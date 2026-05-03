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
        bio: "Award-winning pianist with 15+ years teaching experience. Former principal pianist at the Shanghai Symphony.",
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
      },
      {
        userId: "seed_teacher_2",
        bio: "Concert violinist and passionate educator. Performed at Carnegie Hall and Royal Albert Hall.",
        instruments: ["violin", "viola"],
        genres: ["classical", "contemporary", "jazz"],
        city: "London",
        country: "GB",
        timezone: "Europe/London",
        hourlyRate: 12000,
        yearsExperience: 12,
        education: "Royal Academy of Music, BMus",
        averageRating: 480,
        reviewCount: 31,
        isVerified: true,
      },
      {
        userId: "seed_teacher_3",
        bio: "Classically trained cellist and music educator with a warmth and patience that helps students of all ages.",
        instruments: ["cello", "piano"],
        genres: ["classical", "baroque", "folk"],
        city: "Barcelona",
        country: "ES",
        timezone: "Europe/Madrid",
        hourlyRate: 8000,
        yearsExperience: 10,
        education: "Conservatori Superior de Música del Liceu",
        averageRating: 470,
        reviewCount: 22,
        isVerified: false,
      },
      {
        userId: "seed_teacher_4",
        bio: "Professional guitarist with expertise in both classical and contemporary styles. Studio and live performer.",
        instruments: ["guitar", "lute"],
        genres: ["classical", "flamenco", "contemporary"],
        city: "Rome",
        country: "IT",
        timezone: "Europe/Rome",
        hourlyRate: 9000,
        yearsExperience: 18,
        education: "Conservatorio di Santa Cecilia",
        averageRating: 460,
        reviewCount: 19,
        isVerified: true,
      },
      {
        userId: "seed_teacher_5",
        bio: "Soprano soloist and voice teacher. Specialising in operatic technique, breath control, and stage presence.",
        instruments: ["voice"],
        genres: ["opera", "classical", "art song"],
        city: "Paris",
        country: "FR",
        timezone: "Europe/Paris",
        hourlyRate: 11000,
        yearsExperience: 14,
        education: "Conservatoire de Paris",
        averageRating: 500,
        reviewCount: 38,
        isVerified: true,
      },
      {
        userId: "seed_teacher_6",
        bio: "Master flutist trained in Japan and Germany. Expert in orchestral audition preparation.",
        instruments: ["flute", "piccolo"],
        genres: ["classical", "contemporary", "chamber music"],
        city: "Tokyo",
        country: "JP",
        timezone: "Asia/Tokyo",
        hourlyRate: 10000,
        yearsExperience: 20,
        education: "Tokyo University of the Arts",
        averageRating: 475,
        reviewCount: 28,
        isVerified: true,
      },
      {
        userId: "seed_teacher_7",
        bio: "Harpist for leading orchestras across Europe. Available for weddings, events, and masterclasses.",
        instruments: ["harp"],
        genres: ["classical", "celtic", "pop"],
        city: "Lyon",
        country: "FR",
        timezone: "Europe/Paris",
        hourlyRate: 13000,
        yearsExperience: 11,
        education: "Conservatoire National Supérieur de Lyon",
        averageRating: 490,
        reviewCount: 15,
        isVerified: false,
      },
      {
        userId: "seed_teacher_8",
        bio: "Concert pianist and competition winner. Recipient of the Chopin International Piano Competition award.",
        instruments: ["piano"],
        genres: ["romantic", "classical", "contemporary"],
        city: "Vienna",
        country: "AT",
        timezone: "Europe/Vienna",
        hourlyRate: 20000,
        yearsExperience: 25,
        education: "Universität für Musik und darstellende Kunst Wien",
        averageRating: 500,
        reviewCount: 62,
        isVerified: true,
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
      { teacherId: "seed_teacher_1", type: "lesson", title: "Piano Fundamentals for Beginners", description: "Learn proper technique, music theory basics, and your first pieces.", instrument: "piano", skillLevel: "beginner", priceInCents: 15000, durationMinutes: 60, isOnline: true, tags: ["piano", "beginners", "technique"] },
      { teacherId: "seed_teacher_2", type: "lesson", title: "Advanced Violin Technique", description: "Shifting, vibrato, bow technique and advanced repertoire.", instrument: "violin", skillLevel: "advanced", priceInCents: 12000, durationMinutes: 45, isOnline: true, tags: ["violin", "advanced", "technique"] },
      { teacherId: "seed_teacher_5", type: "lesson", title: "Opera Singing Masterclass", description: "Breath support, resonance, and Italian/German repertoire.", instrument: "voice", skillLevel: "intermediate", priceInCents: 11000, durationMinutes: 60, isOnline: false, city: "Paris", country: "FR", tags: ["voice", "opera", "singing"] },
      // Events
      { teacherId: "seed_teacher_7", type: "event", title: "Wedding & Event Harpist", description: "Solo harp performance for weddings, cocktail hours, and corporate events.", instrument: "harp", skillLevel: "all", priceInCents: 80000, isOnline: false, city: "Lyon", country: "FR", tags: ["harp", "wedding", "corporate"] },
      { teacherId: "seed_teacher_4", type: "event", title: "Classical Guitar Performance", description: "Elegant classical guitar music for intimate gatherings and celebrations.", instrument: "guitar", skillLevel: "all", priceInCents: 60000, isOnline: false, city: "Rome", country: "IT", tags: ["guitar", "events", "classical"] },
      // Masterclasses
      { teacherId: "seed_teacher_8", type: "masterclass", title: "Chopin Nocturnes: Interpretation & Style", description: "Deep dive into Chopin's nocturnes with analysis and live coaching.", instrument: "piano", skillLevel: "advanced", priceInCents: 5000, durationMinutes: 120, isOnline: true, tags: ["piano", "chopin", "interpretation"] },
      { teacherId: "seed_teacher_1", type: "masterclass", title: "Piano Performance Anxiety Workshop", description: "Practical techniques to manage nerves and perform confidently.", instrument: "piano", skillLevel: "all", priceInCents: 3500, durationMinutes: 90, isOnline: true, tags: ["piano", "performance", "psychology"] },
      // Digital Products
      { teacherId: "seed_teacher_3", type: "digital_product", title: "Bach Cello Suite No.1 - Annotated Score", description: "Fully annotated PDF score with fingering, bowing, and interpretive notes.", instrument: "cello", skillLevel: "intermediate", priceInCents: 1299, isOnline: true, tags: ["cello", "bach", "sheet-music"] },
      { teacherId: "seed_teacher_6", type: "digital_product", title: "Flute Warm-Up Routine (30 Days)", description: "A structured 30-day warm-up program for intermediate and advanced flutists.", instrument: "flute", skillLevel: "intermediate", priceInCents: 2499, isOnline: true, tags: ["flute", "practice", "technique"] },
      { teacherId: "seed_teacher_8", type: "digital_product", title: "Competition Preparation Workbook", description: "12-week plan for preparing for piano competitions, with practice schedules.", instrument: "piano", skillLevel: "advanced", priceInCents: 3999, isOnline: true, tags: ["piano", "competition", "practice"] },
      { teacherId: "seed_teacher_5", type: "digital_product", title: "Italian Diction for Singers", description: "Comprehensive guide to Italian pronunciation for classical singers.", instrument: "voice", skillLevel: "all", priceInCents: 1999, isOnline: true, tags: ["voice", "diction", "italian"] },
      { teacherId: "seed_teacher_2", type: "digital_product", title: "Audition Preparation Guide for String Players", description: "Step-by-step guide for orchestral audition preparation.", instrument: "violin", skillLevel: "advanced", priceInCents: 4999, isOnline: true, tags: ["violin", "audition", "orchestra"] },
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
        description: "Deep dive into Chopin's nocturnes with analysis and live coaching.",
        scheduledAt: new Date("2026-06-15T14:00:00Z"),
        durationMinutes: 120,
        maxPerformers: 3,
        maxObservers: 30,
        performerPriceInCents: 8000,
        observerPriceInCents: 2500,
        instrument: "piano",
        registeredPerformers: 1,
        registeredObservers: 8,
      },
      {
        listingId: masterclassListings[1]?.id ?? masterclassListings[0].id,
        teacherId: "seed_teacher_1",
        title: "Piano Performance Anxiety Workshop",
        description: "Practical techniques to manage nerves and perform confidently.",
        scheduledAt: new Date("2026-06-22T16:00:00Z"),
        durationMinutes: 90,
        maxPerformers: 5,
        maxObservers: 50,
        performerPriceInCents: 5000,
        observerPriceInCents: 1500,
        instrument: "piano",
        registeredPerformers: 2,
        registeredObservers: 14,
      },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`  ✓ ${masterclassRows.length} masterclass events`);

  // ── Digital Products ─────────────────────────────────────────────────────
  await db
    .insert(digitalProductsTable)
    .values(
      digitalListings.map((l) => ({
        listingId: l.id,
        teacherId: l.teacherId,
        title: l.title,
        description: l.description ?? "",
        category: "sheet_music",
        instrument: l.instrument ?? undefined,
        priceInCents: l.priceInCents,
        isPublished: true,
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
          body: "Sofia is incredibly patient and her teaching method is clear and structured. I made more progress in one month than I did in a year of self-study.",
        },
        {
          reviewerId: "seed_student_2",
          teacherId: "seed_teacher_2",
          rating: 5,
          title: "World-class musician and teacher",
          body: "James has a phenomenal ear for detail. He spotted and corrected bow technique issues I didn't even know I had.",
        },
        {
          reviewerId: "seed_student_3",
          teacherId: "seed_teacher_5",
          rating: 5,
          title: "Changed my approach to singing forever",
          body: "Amara's operatic technique guidance is second to none. Her passion for teaching is infectious.",
        },
        {
          reviewerId: "seed_student_1",
          teacherId: "seed_teacher_8",
          rating: 5,
          title: "Inspiring masterclass experience",
          body: "Mikhail's masterclass was transformative. The way he explains phrasing and emotional depth opened my eyes to a whole new level of musicianship.",
        },
        {
          reviewerId: "seed_student_2",
          teacherId: "seed_teacher_6",
          rating: 4,
          title: "Excellent warm-up program",
          body: "The 30-day flute warm-up routine is well thought out and genuinely improved my tone quality.",
        },
      ])
      .onConflictDoNothing();

    console.log("  ✓ 5 reviews");
  }

  console.log("✅ Seed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
