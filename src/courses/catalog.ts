// Course planning for the last 27 units of the SFU BSc in Computing Science: what's been taken, what
// Spring 2027 offers at the 300 and 400 level, what Summer and Fall 2027 will likely offer, and a
// recommended plan. Spring sections come from SFU's course outlines (published Oct 2026); Summer and
// Fall 2027 aren't published yet, so those lists are what ran in the same terms of 2025 and 2026.

export type TermKey = 'spring' | 'summer' | 'fall';

export const TERMS: { key: TermKey; label: string; code: string; published: boolean }[] = [
  { key: 'spring', label: 'Spring 2027', code: '1271', published: true },
  { key: 'summer', label: 'Summer 2027', code: '1274', published: false },
  { key: 'fall', label: 'Fall 2027', code: '1277', published: false },
];

/** Units still needed for the degree, as you counted them. */
export const UNITS_LEFT = 27;

/** From the advisor transcript (Aug 2026): passed courses, transfer credit included. */
export const TAKEN: Record<string, string> = {
  'CMPT 130': 'B-', 'CMPT 135': 'TR', 'CMPT 225': 'B', 'CMPT 276': 'A-', 'CMPT 295': 'B', 'CMPT 300': 'B',
  'CMPT 307': 'B-', 'CMPT 310': 'B', 'CMPT 353': 'A', 'CMPT 354': 'A', 'CMPT 361': 'C+', 'CMPT 371': 'A-',
  'CMPT 383': 'B', 'CMPT 415': 'A+', 'CMPT 426': 'P', 'CMPT 427': 'P', 'CMPT 428': 'P', 'CMPT 429': 'P',
  'CMPT 433': 'A-', 'CMPT 474': 'B',
  'MACM 101': 'A+', 'MACM 201': 'A+', 'MACM 316': 'A-', 'MATH 151': 'A+', 'MATH 152': 'A+', 'MATH 232': 'A+',
  'STAT 270': 'A+', 'PHYS 190': 'A', 'ENGL 112W': 'A-', 'IAT 210': 'B+', 'BUS 200': 'A', 'GSWS 101': 'TR',
  'PSYC 100': 'C+', 'REM 100': 'C', 'FREN 101': 'A-',
};

/**
 * Courses in progress, counted as done for prerequisites. The transcript listed Fall 2026 enrolments
 * (CMPT 419, CMPT 431, MATH 251), but you aren't taking anything in Fall 2026.
 */
export const IN_PROGRESS: string[] = [];

/**
 * Prerequisites as groups that must all be met, each group met by any one course in it.
 * Old courses that may stand in for a new one are listed after it with a trailing "?": they make
 * the course "check with an advisor" rather than "eligible".
 */
export type Prereq = string[][];

export interface Course {
  code: string;
  title: string;
  /** One line on what you'll learn. */
  about: string;
  prereq: Prereq;
  /** Requirements that aren't courses, e.g. "an approved capstone proposal". */
  needs?: string;
  /** Courses whose content this repeats; listed so you don't take the same thing twice. */
  overlaps?: string[];
  /** 3 = directly useful for software internships, 1 = niche or research-leaning. */
  value: 1 | 2 | 3;
  /** Why it matters (or doesn't) for the job market. */
  why: string;
  units?: number;
}

const C = (code: string, title: string, value: Course['value'], about: string, why: string, prereq: Prereq, extra: Partial<Course> = {}): Course => ({
  code, title, value, about, why, prereq, ...extra,
});

/** Every upper-division CMPT course that appears below, by code. */
export const COURSES: Record<string, Course> = Object.fromEntries(
  [
    C('CMPT 303', 'Operating Systems', 1, 'Kernel internals: system calls, drivers, virtual memory, scheduling, file systems, memory ordering.', 'Strong systems content, but it covers much of CMPT 300, which you already have.', [['CMPT 225'], ['CMPT 295'], ['CMPT 201', 'ENSC 351']], { overlaps: ['CMPT 300'] }),
    C('CMPT 305', 'Computer Simulation and Modelling', 1, 'Analytic models, discrete-event simulation, experimental design and statistics for systems.', 'Useful for performance engineering, rarely asked for in internship postings.', [['CMPT 225'], ['MACM 101'], ['STAT 270', 'STAT 271']]),
    C('CMPT 307', 'Data Structures and Algorithms', 3, 'Greedy, divide and conquer, dynamic programming, flows, NP-completeness.', 'Core interview material.', [['CMPT 225'], ['MACM 201', 'CMPT 210'], ['MATH 151'], ['MATH 232']]),
    C('CMPT 308', 'Computability and Complexity', 1, 'Automata, Turing machines, computability, complexity classes.', 'Theory; little direct market value.', [['MACM 201', 'CMPT 210']]),
    C('CMPT 310', 'Introduction to Artificial Intelligence', 2, 'Search, regression, gradient descent, MDPs, Bayes nets.', 'Foundation for ML courses.', [['CMPT 225'], ['STAT 271', 'ENSC 280', 'STAT 270?']]),
    C('CMPT 318', 'Special Topics in Computing Science', 2, 'Rotating topic.', 'Depends on the topic.', [['CMPT 225']]),
    C('CMPT 320', 'Social Implications of a Computerized Society', 1, 'How automated systems help or harm society, and designing more humane ones.', 'Interesting, but rarely a hiring signal.', [], { needs: 'A CMPT course and 45 units (you have them).' }),
    C('CMPT 340', 'Biomedical Computing', 1, 'Computing in medicine and biology.', 'Niche unless you target health tech.', [['CMPT 135'], ['MATH 152'], ['MATH 232']]),
    C('CMPT 353', 'Computational Data Science', 3, 'Data cleaning, analysis, ML and Spark on a cluster.', 'Very practical for data and ML roles.', [['CMPT 225'], ['STAT 270', 'STAT 271']]),
    C('CMPT 354', 'Database Systems I', 3, 'Relational model, SQL, database design.', 'SQL shows up in nearly every backend job.', [['CMPT 225'], ['MACM 101']]),
    C('CMPT 361', 'Introduction to Visual Computing', 2, 'Graphics and vision basics: rendering, transforms, raytracing, game engines.', 'Needed for graphics, vision and game roles.', [['CMPT 225'], ['STAT 271', 'ENSC 280', 'STAT 270?']]),
    C('CMPT 362', 'Mobile Applications Programming and Design', 3, 'Building Android apps end to end.', 'Mobile apps are a common internship stack and make portfolio pieces.', [['CMPT 225']]),
    C('CMPT 363', 'User Interface Design', 2, 'Studio course: design, build and evaluate interactive systems.', 'Good for front-end and product roles.', [['CMPT 225'], ['CMPT 263']]),
    C('CMPT 365', 'Multimedia Systems', 1, 'Audio, image and video coding and streaming.', 'Niche: media and streaming companies.', [['CMPT 225']]),
    C('CMPT 371', 'Data Communications and Networking', 3, 'Network architectures, protocols, internetworking.', 'Backend and infrastructure basics.', [['CMPT 225'], ['MATH 151']]),
    C('CMPT 372', 'Web II: Server-side Development', 3, 'Server-side web development.', 'Directly matches backend and full-stack postings.', [['CMPT 272'], ['CMPT 225']]),
    C('CMPT 373', 'Software Development Methods', 3, 'Team software development: agile process, code review, testing, a large term project.', 'Closest thing to working on a real engineering team; great interview stories.', [['CMPT 276']]),
    // Prerequisite CMPT 105W waived for you, so none is listed.
    C('CMPT 376W', 'Professional Responsibility and Technical Writing', 2, 'Technical writing, reports and ethics in computing.', 'Required: it is the upper-division W course for the major.', [], { needs: 'CMPT 105W and CMPT 276; your 105W prerequisite is waived.' }),
    C('CMPT 379', 'Principles of Compiler Design', 2, 'Lexing, parsing, type checking, code generation and optimization; a team-built compiler.', 'Respected by systems and developer-tools teams; a big project.', [['MACM 201', 'CMPT 210'], ['CMPT 295'], ['CMPT 225']]),
    C('CMPT 383', 'Comparative Programming Languages', 2, 'Functional, logic and other paradigms compared.', 'Broadens how you write code.', [['CMPT 225'], ['MACM 101']]),
    C('CMPT 403', 'System Security and Privacy', 3, 'Attacks and defences in systems, networks and the web; privacy.', 'Security knowledge is valued in every backend and infrastructure role.', [['CMPT 201', 'CMPT 300', 'ENSC 351']]),
    C('CMPT 405', 'Design and Analysis of Computing Algorithms', 3, 'Advanced algorithm design, graph algorithms, NP-completeness, approximation.', 'Sharpens exactly what coding interviews test.', [['CMPT 307']]),
    C('CMPT 409', 'Special Topics in Theoretical Computing Science', 1, 'Rotating theory topic.', 'Theory; little direct market value.', [['CMPT 307']]),
    C('CMPT 410', 'Machine Learning', 3, 'ML theory and practice: linear models, kernels, neural networks, optimization.', 'ML is the most in-demand specialty; this is the core course.', [['CMPT 310'], ['MACM 316']], { overlaps: ['CMPT 419 titled "Machine Learning"'] }),
    C('CMPT 411', 'Knowledge Representation', 1, 'Logic-based AI and reasoning.', 'Research-leaning.', [], { needs: 'Nine upper-division CMPT units or instructor permission (you have them).' }),
    C('CMPT 412', 'Computer Vision', 2, 'Image classification, detection, segmentation, 3D reconstruction, modern deep networks.', 'Strong for ML and vision roles.', [['CMPT 361'], ['MATH 152']]),
    C('CMPT 413', 'Computational Linguistics', 3, 'Natural language processing, the field behind LLMs.', 'NLP and LLM skills are in high demand right now.', [], { needs: 'Nine upper-division CMPT units or instructor permission (you have them).' }),
    C('CMPT 417', 'Intelligent Systems', 2, 'Constraint programming, heuristic search, combinatorial optimization for scheduling and planning.', 'Optimization shows up in logistics and planning teams.', [['CMPT 225']]),
    C('CMPT 419', 'Special Topics in Artificial Intelligence', 3, 'Rotating AI topic; each section has its own.', 'AI topics are in demand. Each section has its own topic; a second 419 usually counts when the topic differs.', []),
    C('CMPT 420', 'Deep Learning', 3, 'Training deep networks: CNNs, autoencoders, RNNs, LSTMs, GANs.', 'Directly useful for ML engineering roles.', [['CMPT 310'], ['CMPT 410', 'CMPT 419']]),
    C('CMPT 431', 'Distributed Systems', 3, 'Distributed computing and parallel systems.', 'Backend and infrastructure staple.', [['CMPT 201', 'CMPT 300', 'ENSC 351'], ['CMPT 371']]),
    C('CMPT 433', 'Embedded Systems', 2, 'Embedded Linux, hardware/software co-design.', 'Good for embedded and hardware-adjacent roles.', [['CMPT 201', 'CMPT 300', 'ENSC 351'], ['CMPT 295']]),
    C('CMPT 441', 'Computational Biology', 1, 'Algorithms for biological sequence data.', 'Niche: bioinformatics.', [['CMPT 307']]),
    C('CMPT 454', 'Database Systems II', 3, 'Storage and indexing, query evaluation, transactions, concurrency control, crash recovery.', 'How databases work inside; strong for backend and data infrastructure.', [['CMPT 201', 'CMPT 300', 'ENSC 351'], ['CMPT 354']]),
    C('CMPT 455', 'Data Mining', 2, 'Clustering, classification and pattern mining at scale.', 'Useful for data roles.', [['CMPT 354'], ['STAT 271', 'STAT 270?']]),
    C('CMPT 459', 'Special Topics in Database Systems', 2, 'Rotating database topic.', 'Depends on the topic.', [['CMPT 354']]),
    C('CMPT 464', 'Geometric Modelling in Computer Graphics', 1, 'Curves, surfaces and meshes.', 'Niche: graphics and CAD.', [['CMPT 361'], ['MACM 316']]),
    C('CMPT 466', 'Animation', 1, 'Computer animation techniques.', 'Niche: games and film.', [['CMPT 361']]),
    C('CMPT 467', 'Visualization', 2, 'Interactive data visualization and its evaluation.', 'Nice for front-end and data-product roles.', [['CMPT 225']]),
    C('CMPT 469', 'Special Topics in Computer Graphics', 1, 'Rotating graphics topic.', 'Niche.', [['CMPT 361']]),
    C('CMPT 471', 'Networking II', 3, 'TCP performance, software-defined networks, datacenter design, networking for AI, network security.', 'Cloud and infrastructure teams look for this.', [['CMPT 201', 'CMPT 300', 'ENSC 351'], ['CMPT 371']]),
    C('CMPT 473', 'Software Testing, Reliability and Security', 3, 'Test design, coverage, automated testing and reliability.', 'Every software team tests; this is rare on student resumes.', [['CMPT 276']], { needs: '15 upper-division CMPT units (you have them).' }),
    C('CMPT 474', 'Web Systems Architecture', 3, 'Scalable web and cloud architecture.', 'Backend and cloud.', [['CMPT 371']]),
    C('CMPT 477', 'Introduction to Formal Verification', 1, 'Proving programs correct with logic and tools.', 'Niche outside a few teams.', [['CMPT 276']]),
    C('CMPT 476', 'Introduction to Quantum Algorithms', 1, 'Quantum circuits and algorithms (Shor, Grover).', 'Niche for internships. The same course as MACM 476, which runs in Spring 2027.', [['MATH 232']], { overlaps: ['MACM 476'] }),
    C('CMPT 478', 'Current Topics in Quantum Computing', 1, 'Compiling quantum algorithms to circuits.', 'Research-leaning. Needs CMPT 476 (MACM 476 is the same course) first, and 478 only ran in Spring 2025 and Spring 2027, so it likely won\'t run again before you graduate.', [['CMPT 476', 'PHYS 416', 'MACM 476?']]),

    // Math and interactive arts courses with some value for software work.
    C('MACM 401', 'Introduction to Computer Algebra', 1, 'Algorithms for exact symbolic computation: polynomials, GCDs, factoring.', 'Interesting algorithms, little direct market value.', [['CMPT 307']]),
    C('MACM 409', 'Numerical Linear Algebra', 2, 'Implementing matrix algorithms (least squares, SVD, eigenvalues) efficiently.', 'The maths under ML and graphics, done in code.', [['MATH 251'], ['MACM 316']]),
    C('MACM 442', 'Cryptography', 2, 'Public-key and symmetric cryptography, protocols and attacks.', 'Pairs with security roles.', [['MATH 340', 'MATH 332', 'MATH 342', 'CMPT 405']]),
    C('MACM 476', 'Introduction to Quantum Algorithms', 1, 'Quantum circuits and algorithms (Shor, Grover).', 'Niche for internships, and the route to CMPT 478 if you want quantum.', [['MATH 232']], { overlaps: ['CMPT 476'] }),
    C('MATH 308', 'Linear Optimization', 2, 'Linear programming, the simplex method and duality.', 'Optimization comes up in ML, operations and logistics teams.', [['MATH 151'], ['MATH 232']]),
    C('MATH 340', 'Algebra II: Rings and Fields', 1, 'Rings, fields and polynomials.', 'Pure maths; it does unlock MACM 442 Cryptography.', [['MATH 232']]),
    C('MATH 345', 'Introduction to Graph Theory', 2, 'Paths, trees, matchings, colouring and planarity.', 'Graph thinking helps with algorithm interviews.', [['MACM 201']]),
    C('MATH 348', 'Stochastic Modelling and Simulation', 2, 'Markov chains, queues and simulation.', 'Useful for performance modelling and ML.', [['MATH 232']]),
    C('MATH 408', 'Discrete Optimization', 2, 'Integer programming, network and combinatorial optimization.', 'Optimization for scheduling and routing problems.', [['MATH 308']]),
    C('MATH 445', 'Graph Theory', 1, 'Advanced graph theory.', 'Theory; needs MATH 345 first.', [['MATH 345']]),
    C('IAT 339', 'Web Design and Development', 3, 'Building responsive websites: HTML, CSS, JavaScript and design.', 'Front-end web skills map straight onto job postings.', [['IAT 235'], ['IAT 265']], { units: 4 }),
    C('IAT 351', 'Advanced Human-Computer Interaction', 2, 'Designing and evaluating interactive software.', 'Good for front-end and product roles.', [['IAT 201']], { units: 4 }),
    C('IAT 355', 'Introduction to Visual Analytics', 2, 'Interactive visualization of data with code.', 'Data visualization for front-end and data roles.', [['IAT 201'], ['IAT 265', 'CMPT 225']], { units: 4 }),
    C('IAT 359', 'Mobile Computing', 3, 'Building mobile apps.', 'Mobile development is a common internship stack.', [['IAT 265']], { units: 4, overlaps: ['CMPT 362'] }),
    C('IAT 360', 'Exploring Artificial Intelligence', 1, 'Uses, concepts and impact of AI, for a general audience.', 'Lighter than CMPT 310, which you have.', [['IAT 265', 'CMPT 225']], { units: 4 }),
    C('IAT 438', 'User Experience Design', 2, 'UX research and design practice.', 'Useful for product-minded engineers.', [['IAT 309W'], ['IAT 333']], { units: 4 }),
    C('IAT 459', 'Internet Computing Technologies', 3, 'Full-stack web: servers, databases and APIs.', 'Backend and full-stack web, the most common internship work.', [['IAT 339'], ['IAT 359']], { units: 4 }),
    C('CMPT 479', 'Special Topics in Computing Systems', 3, 'Rotating systems topic.', 'Systems topics (cloud, OS, storage) are valued for backend roles.', [['CMPT 201', 'CMPT 300', 'ENSC 351']]),
    C('CMPT 489', 'Special Topics in Programming Languages', 2, 'Rotating programming languages topic.', 'Good for developer-tools and compiler teams.', [['CMPT 383']]),
    C('CMPT 494', 'Software Systems Capstone Project I', 3, 'A supervised team project, research or a real client, shown at Capstone Day.', 'A substantial team project to put on your resume.', [], { needs: '15 upper-division CMPT units and an approved Capstone Project Proposal, arranged before the term.' }),
    C('CMPT 495', 'Software Systems Capstone Project II', 3, 'Continues the CMPT 494 project.', 'Pairs with 494.', [['CMPT 494']]),
  ].map((c) => [c.code, c]),
);

export interface Section {
  section: string;
  instructor?: string;
  /** e.g. "Mo 10:30–11:20, Th 10:30–12:20". */
  times?: string;
  campus?: string;
  /** Special-topic title, when the outline names one. */
  topic?: string;
}

export interface Offering {
  code: string;
  sections: Section[];
}

/** Spring 2027 lecture sections (co-op practicums, directed studies and research projects left out). */
export const SPRING_2027: Offering[] = [
  { code: 'CMPT 303', sections: [{ section: 'D100', instructor: 'Steven Ko', times: 'We 13:30–14:20, Fr 12:30–14:20', campus: 'Burnaby' }] },
  { code: 'CMPT 305', sections: [{ section: 'D100', instructor: 'Alaa Alameldeen', times: 'We 11:30–12:20, Fr 10:30–12:20', campus: 'Burnaby' }] },
  {
    code: 'CMPT 307',
    sections: [
      { section: 'D100', instructor: 'Valentine Kabanets', times: 'Mo 10:30–11:20, Th 10:30–12:20', campus: 'Burnaby' },
      { section: 'E100', instructor: 'Valentine Kabanets', times: 'Mo 16:30–17:20, Th 16:30–18:20', campus: 'Burnaby' },
    ],
  },
  { code: 'CMPT 308', sections: [{ section: 'D100', instructor: 'Evgenia Ternovska', times: 'Mo 12:30–14:20, We 12:30–13:20', campus: 'Burnaby' }] },
  { code: 'CMPT 310', sections: [{ section: 'D100', instructor: 'Maxwell Libbrecht', times: 'We 9:30–10:20, Fr 8:30–10:20', campus: 'Burnaby' }] },
  { code: 'CMPT 320', sections: [{ section: 'D100', instructor: 'Nicholas Vincent', times: 'Mo 14:30–15:20, Th 14:30–16:20', campus: 'Burnaby' }] },
  { code: 'CMPT 353', sections: [{ section: 'E100', instructor: 'Hedayat Zarkoob', times: 'Mo 17:30–19:20, We 18:30–19:20' }] },
  {
    code: 'CMPT 354',
    sections: [
      { section: 'D100', instructor: 'Martin Ester', times: 'Tu 14:30–16:20, Th 14:30–15:20', campus: 'Burnaby' },
      { section: 'D200', times: 'Mo 8:30–9:20, Th 8:30–10:20', campus: 'Surrey' },
    ],
  },
  { code: 'CMPT 361', sections: [{ section: 'D100', instructor: 'Yasutaka Furukawa', times: 'We 15:30–16:20, Fr 14:30–16:20', campus: 'Burnaby' }] },
  { code: 'CMPT 363', sections: [{ section: 'D100', instructor: 'Parmit Chilana', times: 'Mo 12:30–13:20, Th 12:30–14:20', campus: 'Burnaby' }] },
  { code: 'CMPT 371', sections: [{ section: 'E100', times: 'Tu 17:30–18:20, Th 17:30–19:20', campus: 'Burnaby' }] },
  {
    code: 'CMPT 376W',
    sections: [
      { section: 'D200', times: 'Mo 14:30–15:20, Th 14:30–16:20', campus: 'Surrey' },
      { section: 'E100', times: 'Mo 16:30–17:20, We 16:30–18:20', campus: 'Burnaby' },
    ],
  },
  { code: 'CMPT 379', sections: [{ section: 'D100', instructor: 'Anders Miltner', times: 'Tu 8:30–10:20, Th 8:30–9:20', campus: 'Burnaby' }] },
  { code: 'CMPT 405', sections: [{ section: 'D100', times: 'We 15:30–16:20, Fr 14:30–16:20', campus: 'Burnaby' }] },
  { code: 'CMPT 409', sections: [{ section: 'D100', instructor: 'Igor Shinkar', times: 'Tu 12:30–14:20, Fr 12:30–13:20', campus: 'Burnaby' }] },
  { code: 'CMPT 410', sections: [{ section: 'D100', instructor: 'Ke Li', times: 'Tu 12:30–14:20, Fr 12:30–13:20', campus: 'Burnaby' }] },
  { code: 'CMPT 411', sections: [{ section: 'D100' }] },
  { code: 'CMPT 412', sections: [{ section: 'E100', instructor: 'Richard Zhang', times: 'Mo 17:30–20:20', campus: 'Burnaby' }] },
  { code: 'CMPT 417', sections: [{ section: 'D100', instructor: 'Hang Ma', times: 'Th 11:30–14:20', campus: 'Burnaby' }] },
  {
    code: 'CMPT 419',
    sections: [
      { section: 'D100', instructor: 'Angelica Lim', times: 'Mo 14:30–16:20, We 14:30–15:20', campus: 'Burnaby' },
      { section: 'D200', instructor: 'Nicholas Vincent', times: 'Mo 10:30–12:20, We 10:30–11:20', campus: 'Burnaby' },
      { section: 'E100', instructor: 'Marzena Karpinska', times: 'Mo 16:30–17:20, We 16:30–18:20', campus: 'Burnaby' },
    ],
  },
  { code: 'CMPT 420', sections: [{ section: 'G100', instructor: 'Wuyang Chen', times: 'Mo 9:30–12:20', campus: 'Burnaby' }] },
  { code: 'CMPT 431', sections: [{ section: 'D100', instructor: 'Keval Vora', times: 'Tu 8:30–11:20' }] },
  { code: 'CMPT 433', sections: [{ section: 'D100', instructor: 'Brian Fraser', times: 'Tu 14:30–16:20, Fr 14:30–15:20', campus: 'Surrey' }] },
  { code: 'CMPT 454', sections: [{ section: 'E100', instructor: 'Ke Wang', times: 'Tu 17:30–20:20', campus: 'Burnaby' }] },
  { code: 'CMPT 467', sections: [{ section: 'D100', times: 'We 11:30–12:20, Fr 10:30–12:20', campus: 'Burnaby' }] },
  { code: 'CMPT 471', sections: [{ section: 'D100', instructor: 'Mohamed Hefeeda', times: 'Tu 16:30–17:20, Th 15:30–17:20', campus: 'Burnaby' }] },
  { code: 'CMPT 478', sections: [{ section: 'D100', instructor: 'Matthew Amy', times: 'Mo 12:30–13:20, Th 12:30–14:20', campus: 'Burnaby', topic: 'Quantum Circuits and Compilation' }] },
  { code: 'CMPT 489', sections: [{ section: 'D100', instructor: 'Anders Miltner', times: 'Tu 14:30–16:20, Th 14:30–15:20', campus: 'Burnaby' }] },
  { code: 'CMPT 494', sections: [{ section: 'D100', instructor: 'Ghassan Hamarneh' }, { section: 'D200' }, { section: 'D300' }] },
  { code: 'CMPT 495', sections: [{ section: 'D100' }, { section: 'D200' }, { section: 'D300' }] },
  { code: 'MACM 401', sections: [{ section: 'D100', instructor: 'Michael Monagan', times: 'Tu 14:30–16:20, Th 14:30–15:20' }] },
  { code: 'MACM 476', sections: [{ section: 'D100', instructor: 'Nadish de Silva', times: 'We 11:30–12:20, Fr 10:30–12:20', campus: 'Burnaby' }] },
  { code: 'MATH 308', sections: [{ section: 'D100', times: 'Mo 14:30–15:20, We 14:30–15:20, Fr 14:30–15:20' }] },
  { code: 'MATH 348', sections: [{ section: 'D100', times: 'Mo 15:30–16:20, We 15:30–16:20, Fr 15:30–16:20' }] },
  { code: 'MATH 445', sections: [{ section: 'D100', instructor: 'Ladislav Stacho', times: 'Mo 14:30–15:20, We 14:30–15:20, Fr 14:30–15:20' }] },
  { code: 'IAT 339', sections: [{ section: 'D100', instructor: 'Helmine Serban', times: 'Th 8:30–11:20', campus: 'Surrey' }] },
  { code: 'IAT 355', sections: [{ section: 'E100', instructor: 'Christopher Shaw', times: 'Mo 16:30–17:50, We 16:30–17:50', campus: 'Surrey' }] },
  { code: 'IAT 359', sections: [{ section: 'D100', instructor: 'Helmine Serban', times: 'Tu 8:30–11:20', campus: 'Surrey' }] },
  { code: 'IAT 360', sections: [{ section: 'B100', instructor: 'Nilay Yalcin', times: 'Blended, mostly online', campus: 'Surrey' }] },
  { code: 'IAT 459', sections: [{ section: 'D100', instructor: 'Helmine Serban', times: 'Fr 9:30–12:20', campus: 'Surrey' }] },
];

/** Upper-division courses that ran in Summer or Fall of 2025 and 2026. */
const PAST: Record<'summer' | 'fall', { 2025: string[]; 2026: string[] }> = {
  summer: {
    2025: ['307', '310', '353', '354', '365', '371', '376W', '379', '383', '469', '479', '494', '495'],
    2026: ['307', '310', '353', '354', '371', '372', '376W', '383', '403', '409', '419', '471', '479', '494', '495'],
  },
  fall: {
    2025: ['307', '308', '310', '340', '354', '361', '362', '365', '371', '373', '376W', '383', '403', '405', '409', '410', '413', '417', '419', '431', '441', '454', '459', '464', '469', '477', '479', '489', '494', '495'],
    2026: ['307', '310', '318', '354', '361', '365', '371', '373', '376W', '383', '403', '409', '410', '413', '419', '431', '441', '454', '455', '464', '466', '469', '473', '479', '494', '495'],
  },
};

/** MATH, MACM and IAT courses from the list above that ran in Summer or Fall of 2025 and 2026. */
const OTHER_PAST: Record<'summer' | 'fall', { 2025: string[]; 2026: string[] }> = {
  summer: { 2025: ['IAT 339', 'IAT 438'], 2026: ['IAT 339', 'IAT 360', 'IAT 438'] },
  fall: {
    2025: ['MACM 409', 'MACM 442', 'MATH 308', 'MATH 340', 'MATH 345', 'IAT 339', 'IAT 351', 'IAT 355', 'IAT 359', 'IAT 360'],
    2026: ['MATH 308', 'MATH 340', 'MATH 345', 'MATH 408', 'IAT 339', 'IAT 351', 'IAT 359', 'IAT 360'],
  },
};

const ranIn = (term: 'summer' | 'fall', year: 2025 | 2026) => [...PAST[term][year].map((n) => `CMPT ${n}`), ...OTHER_PAST[term][year]];

const SUBJECTS = ['CMPT', 'MACM', 'MATH', 'IAT'];

/** CMPT first, then MACM, MATH and IAT; by number within each. */
export function compareCodes(a: string, b: string): number {
  const [sa, na] = a.split(' ');
  const [sb, nb] = b.split(' ');
  return SUBJECTS.indexOf(sa) - SUBJECTS.indexOf(sb) || parseInt(na) - parseInt(nb);
}

export type Likelihood = 'likely' | 'possible';

/** Courses expected in a future term: "likely" ran in both past years, "possible" in one. */
export function expected(term: 'summer' | 'fall'): { code: string; likelihood: Likelihood; years: number[] }[] {
  const a = ranIn(term, 2025);
  const b = ranIn(term, 2026);
  return [...new Set([...a, ...b])]
    .filter((code) => code in COURSES)
    .sort(compareCodes)
    .map((code) => {
      const years = [a.includes(code) ? 2025 : 0, b.includes(code) ? 2026 : 0].filter(Boolean);
      return { code, likelihood: years.length === 2 ? 'likely' : 'possible', years };
    });
}

export type Status = 'taken' | 'in-progress' | 'eligible' | 'check' | 'missing';

export const STATUS_LABELS: Record<Status, string> = {
  taken: 'Taken',
  'in-progress': 'Taking now',
  eligible: 'Eligible',
  check: 'Check with advisor',
  missing: 'Missing prerequisite',
};

export interface Eligibility {
  status: Status;
  /** Prerequisite groups you haven't met, e.g. ["CMPT 201 or ENSC 351"]. */
  missing: string[];
  /** Why it's "check": an old course standing in for a new one, an overlap, or a permission. */
  notes: string[];
}

/** Whether you can take a course, from your history. Courses in progress count as done. */
export function eligibility(course: Course, taken: Iterable<string> = Object.keys(TAKEN), inProgress: Iterable<string> = IN_PROGRESS): Eligibility {
  const done = new Set(taken);
  const now = new Set(inProgress);
  if (done.has(course.code)) return { status: 'taken', missing: [], notes: [] };
  // 419 is special topics: a different topic counts again.
  if (now.has(course.code) && course.code !== 'CMPT 419') return { status: 'in-progress', missing: [], notes: [] };
  const has = (c: string) => done.has(c) || now.has(c);
  const missing: string[] = [];
  const notes: string[] = [];
  for (const group of course.prereq) {
    const real = group.filter((c) => !c.endsWith('?'));
    if (real.some(has)) continue;
    const stand = group.filter((c) => c.endsWith('?')).map((c) => c.slice(0, -1)).find(has);
    if (stand) notes.push(`You have ${stand}, the older version of ${real[0]}.`);
    else missing.push(real.join(' or '));
  }
  for (const o of course.overlaps ?? []) {
    if (has(o)) notes.push(`Covers much of ${o}, which you've taken.`);
    else if (o.startsWith('CMPT 419') && now.has('CMPT 419')) notes.push(`No credit if your current CMPT 419 is titled "Machine Learning".`);
  }
  const status: Status = missing.length ? 'missing' : notes.length ? 'check' : 'eligible';
  return { status, missing, notes };
}

export interface PlanItem {
  code: string;
  /** Spring only, where sections are known. */
  section?: string;
}

export type Plan = Record<TermKey, PlanItem[]>;

export interface CoursePlan {
  plan: Plan;
  updatedAt: number;
}

/**
 * The recommendation: 9 courses, 3 a term, for software internships.
 * Spring: the required writing course, machine learning, and distributed systems, with no time clashes.
 * Summer: security, systems and an AI topic. Fall: team software engineering, testing, and NLP.
 */
export const RECOMMENDED: Plan = {
  spring: [
    { code: 'CMPT 376W', section: 'E100' },
    { code: 'CMPT 410', section: 'D100' },
    { code: 'CMPT 431', section: 'D100' },
  ],
  summer: [{ code: 'CMPT 403' }, { code: 'CMPT 479' }, { code: 'CMPT 419' }],
  fall: [{ code: 'CMPT 373' }, { code: 'CMPT 473' }, { code: 'CMPT 413' }],
};

/** Why each recommended course made the cut. */
export const RECOMMENDATION_NOTES: Record<string, string> = {
  'CMPT 376W': 'Required for the major (upper-division W). Take it early; E100 avoids a Surrey commute.',
  'CMPT 410': 'The core ML course, and the prerequisite for CMPT 420 Deep Learning.',
  'CMPT 431': 'Distributed systems: the backbone of backend and cloud work, with a hands-on design project. Tuesday mornings, one long block.',
  'CMPT 403': 'Security ran in Summer 2026 and every Fall; valued by backend and infrastructure teams.',
  'CMPT 479': 'Systems special topic, offered every Summer and Fall.',
  'CMPT 419': 'An AI topic such as LLMs or applied ML; check the topic once the Summer outline is out.',
  'CMPT 373': 'Team software process on a large project: the most "real job" course in the catalogue.',
  'CMPT 473': 'Testing and reliability. Ran in Fall 2026 only, so CMPT 405 is the backup.',
  'CMPT 413': 'NLP, the field behind LLMs.',
};

/** Good swaps when a recommended course is full or doesn't run. */
export const ALTERNATES: { code: string; term: TermKey; note: string }[] = [
  { code: 'CMPT 471', term: 'spring', note: 'Datacenters, SDN and networking for AI with Mohamed Hefeeda.' },
  { code: 'CMPT 454', term: 'spring', note: 'Database internals (indexing, transactions, recovery) on Tuesday evenings; also runs in Fall.' },
  { code: 'CMPT 494', term: 'spring', note: 'Capstone, then CMPT 495 in Summer: a team project for your resume. Needs an approved proposal before the term.' },
  { code: 'CMPT 405', term: 'fall', note: 'Advanced algorithms: direct interview prep.' },
  { code: 'CMPT 362', term: 'fall', note: 'Mobile apps, if it runs (Fall 2025).' },
];

export const unitsOf = (code: string) => COURSES[code]?.units ?? 3;

export function planUnits(plan: Plan): number {
  return Object.values(plan).flat().reduce((sum, i) => sum + unitsOf(i.code), 0);
}

/** A course planned in two terms, or one you've already taken. */
export function planProblems(plan: Plan): string[] {
  const out: string[] = [];
  const seen = new Map<string, TermKey>();
  for (const t of TERMS) {
    for (const i of plan[t.key]) {
      const c = COURSES[i.code];
      if (!c) continue;
      const prev = seen.get(i.code);
      // Special topics may repeat with a different topic.
      if (prev && !/Special Topics/.test(c.title)) out.push(`${i.code} is planned in both ${label(prev)} and ${t.label}.`);
      seen.set(i.code, t.key);
      const e = eligibility(c);
      if (e.status === 'taken') out.push(`You've already taken ${i.code}.`);
      if (e.status === 'missing') out.push(`${i.code} needs ${e.missing.join(' and ')}.`);
    }
  }
  return out;
}

const label = (k: TermKey) => TERMS.find((t) => t.key === k)!.label;

interface Slot {
  day: string;
  start: number;
  end: number;
}

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** "Mo 10:30–11:20, Th 10:30–12:20" → meeting slots. */
export function slots(times: string | undefined): Slot[] {
  if (!times) return [];
  return [...times.matchAll(/(Mo|Tu|We|Th|Fr|Sa|Su)\s+(\d{1,2}:\d{2})[–-](\d{1,2}:\d{2})/g)].map((m) => ({ day: m[1], start: toMin(m[2]), end: toMin(m[3]) }));
}

export function sectionOf(code: string, section?: string): Section | undefined {
  const o = SPRING_2027.find((x) => x.code === code);
  return o?.sections.find((s) => s.section === section) ?? o?.sections[0];
}

/** Pairs of Spring courses whose chosen sections meet at the same time. */
export function clashes(items: PlanItem[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = slots(sectionOf(items[i].code, items[i].section)?.times);
      const b = slots(sectionOf(items[j].code, items[j].section)?.times);
      if (a.some((x) => b.some((y) => x.day === y.day && x.start < y.end && y.start < x.end))) out.push([items[i].code, items[j].code]);
    }
  }
  return out;
}

/** SFU's outline page for a Spring section. */
export const outlineUrl = (code: string, section: string) => {
  const [dept, num] = code.toLowerCase().split(' ');
  return `https://www.sfu.ca/outlines.html?2027/spring/${dept}/${num}/${section.toLowerCase()}`;
};

export const coursysUrl = (term: string) => `https://coursys.sfu.ca/browse/#!semester=${term}&subject=CMPT`;

/** CourSys's page for one offering: "Spring 2027", CMPT 431, D100 → …/browse/info/2027sp-cmpt-431-d1. */
export function coursysOfferingUrl(code: string, term: string, section = 'D100'): string {
  const [season, year] = term.split(' ');
  const s = { Spring: 'sp', Summer: 'su', Fall: 'fa' }[season] ?? 'sp';
  const [dept, num] = code.toLowerCase().split(' ');
  // D100 → d1, E200 → e2.
  const sec = section.toLowerCase().replace(/^([a-z])(\d)\d\d$/, '$1$2');
  return `https://coursys.sfu.ca/browse/info/${year}${s}-${dept}-${num}-${sec}`;
}

/** The course's newest CourSys page: Spring 2027 when it runs then, else the last time it ran. */
export function courseLink(code: string): { url: string; term: string } {
  const spring = SPRING_2027.find((o) => o.code === code);
  if (spring) return { url: coursysOfferingUrl(code, 'Spring 2027', spring.sections[0].section), term: 'Spring 2027' };
  const past = [...(PAST_SECTIONS[code] ?? [])].sort((a, b) => TERM_ORDER(b.term) - TERM_ORDER(a.term))[0];
  if (past) return { url: coursysOfferingUrl(code, past.term, past.section), term: past.term };
  const ran = (['fall', 'summer'] as const)
    .flatMap((t) => ([2026, 2025] as const).filter((y) => ranIn(t, y).includes(code)).map((y) => ({ term: `${t === 'fall' ? 'Fall' : 'Summer'} ${y}` })))
    .sort((a, b) => TERM_ORDER(b.term) - TERM_ORDER(a.term))[0];
  // Lecture sections are almost always D100.
  return ran ? { url: coursysOfferingUrl(code, ran.term), term: ran.term } : { url: coursysUrl('1271'), term: 'Spring 2027' };
}

/** Repairs a saved plan: unknown courses dropped, missing terms filled in. */
export function normalizePlan(p: Partial<Plan> | null | undefined): Plan {
  const out = { spring: [], summer: [], fall: [] } as Plan;
  for (const t of TERMS) out[t.key] = (p?.[t.key] ?? []).filter((i) => i && typeof i.code === 'string' && i.code in COURSES);
  return out;
}

export interface PastSection {
  term: string;
  section: string;
  instructor?: string;
  campus?: string;
  topic?: string;
}

const P = (term: string, section: string, instructor?: string, campus = 'Burnaby', topic?: string): PastSection => ({ term, section, instructor, campus, topic });

/**
 * Who taught the courses in your plan and its swaps, 2024–2026, from SFU's outlines, so you can
 * pick the term with the instructor you want. 419 is left out: its topic changes with the instructor.
 */
export const PAST_SECTIONS: Record<string, PastSection[]> = {
  'CMPT 376W': [
    P('Spring 2024', 'D100', 'Steve Pearce'), P('Spring 2024', 'D100', 'Parsa Rajabi'), P('Spring 2024', 'D100', 'Chris Kerslake'),
    P('Spring 2024', 'D200', 'Parsa Rajabi', 'Surrey'), P('Spring 2024', 'D200', 'Chris Kerslake', 'Surrey'),
    P('Summer 2024', 'D100', 'John Edgar'), P('Summer 2024', 'D100', 'Tara Immell'), P('Fall 2024', 'D100', 'Angelica Lim'), P('Fall 2024', 'E100', 'Felix Lo'),
    P('Spring 2025', 'D100', 'Felix Lo'), P('Spring 2025', 'D200', undefined, 'Surrey'), P('Summer 2025', 'D100', 'Felix Lo'),
    P('Fall 2025', 'D100', 'Felix Lo'), P('Fall 2025', 'D200', 'Cristina Eftenaru'), P('Spring 2026', 'D100', 'Cristina Eftenaru'),
    P('Spring 2026', 'D200', 'John Edgar', 'Surrey'), P('Summer 2026', 'D100', 'Harinder Khangura', 'Surrey'), P('Summer 2026', 'E200', 'Herbert Tsang'),
    P('Fall 2026', 'D100', 'Chris Kerslake'), P('Fall 2026', 'D200', 'Mirza Zaeem Baig'),
  ],
  'CMPT 410': [P('Spring 2024', 'D100'), P('Fall 2024', 'D100', 'Steven Bergner'), P('Spring 2025', 'D100', 'Ke Li'), P('Fall 2025', 'D100', 'Mo Chen'), P('Spring 2026', 'D100', 'Ke Li'), P('Fall 2026', 'D100', 'Mo Chen')],
  'CMPT 431': [P('Spring 2024', 'D100', 'Alaa Alameldeen'), P('Fall 2024', 'D100', 'Alaa Alameldeen'), P('Spring 2025', 'D100'), P('Fall 2025', 'D100', 'Keval Vora'), P('Spring 2026', 'D100', 'Keval Vora'), P('Fall 2026', 'D100', 'Keval Vora')],
  'CMPT 403': [P('Summer 2024', 'D100', 'Tao Wang'), P('Fall 2025', 'D100', 'Jianliang Wu'), P('Summer 2026', 'D100', 'Tao Wang'), P('Fall 2026', 'D100', 'Jianliang Wu')],
  'CMPT 479': [
    P('Spring 2024', 'D200', 'Deepak Rout'), P('Spring 2024', 'D300', undefined, 'Burnaby', 'Software Engineering'),
    P('Summer 2024', 'E100', 'Rob Cameron', 'Surrey', 'Compilers for SIMD'), P('Fall 2024', 'D100', 'Saba Alimadadi'),
    P('Fall 2024', 'D200', 'Deepak Rout', 'Burnaby', 'Enterprise Security'), P('Fall 2024', 'D300', 'Deepak Rout', 'Burnaby', 'Digital Forensics'),
    P('Spring 2025', 'D100', undefined, 'Burnaby', 'Mobile Security'), P('Spring 2025', 'E100', 'Rob Cameron', 'Burnaby', 'Compilers for SIMD'),
    P('Summer 2025', 'D200', 'Nick Sumner', 'Burnaby', 'Software Engineering'), P('Summer 2025', 'E100', undefined, 'Burnaby', 'Digital Forensics'),
    P('Fall 2025', 'D100', 'Saba Alimadadi', 'Burnaby', 'Web application analysis and testing'), P('Fall 2025', 'E100', 'Jianliang Wu'), P('Fall 2025', 'E200', 'Keval Vora'),
    P('Spring 2026', 'D100', 'Nick Sumner', 'Burnaby', 'Software Engineering'), P('Spring 2026', 'D200', 'Sze Yiu Chau', 'Burnaby', 'Attacking and Protecting Networked Systems'),
    P('Summer 2026', 'D100', 'Tao Wang', 'Burnaby', 'AI in Security'), P('Summer 2026', 'E100', 'Rob Cameron', 'Surrey', 'Compilers for SIMD'),
    P('Fall 2026', 'D100', 'Saba Alimadadi', 'Burnaby', 'Web Engineering'), P('Fall 2026', 'D300', 'Alaa Alameldeen', 'Burnaby', 'GPU Architecture and Programming'),
    P('Fall 2026', 'E100', 'Keval Vora', 'Burnaby', 'Privacy Preserving Graph Analytics'),
  ],
  'CMPT 379': [P('Summer 2023', 'D100', 'Thomas Shermer'), P('Fall 2023', 'D100', 'Thomas Shermer'), P('Summer 2025', 'D100', 'Anoop Sarkar')],
  'CMPT 373': [P('Fall 2024', 'D100', 'Nick Sumner', 'Surrey'), P('Fall 2025', 'D100', 'Nick Sumner', 'Surrey'), P('Fall 2026', 'D100', 'Nick Sumner', 'Surrey')],
  'CMPT 473': [P('Fall 2024', 'D100', 'Nick Sumner', 'Surrey'), P('Spring 2026', 'E100', 'Rob Cameron', 'Surrey'), P('Fall 2026', 'D100', 'Nick Sumner', 'Surrey')],
  'CMPT 413': [P('Spring 2024', 'D100', 'Angel Chang'), P('Spring 2025', 'D100', 'Angel Chang'), P('Fall 2025', 'D100', 'Anoop Sarkar'), P('Spring 2026', 'D100', 'Angel Chang'), P('Fall 2026', 'D100', 'Zhiyun Peng')],
  'CMPT 454': [
    P('Spring 2024', 'D100', 'Ke Wang'), P('Summer 2024', 'D100', 'John Edgar'), P('Fall 2024', 'E100', 'Ke Wang'),
    P('Spring 2025', 'D100', 'Tianzheng Wang'), P('Fall 2025', 'D100', 'Ke Wang'), P('Spring 2026', 'D100', 'Tianzheng Wang'), P('Fall 2026', 'D100', 'Tianzheng Wang')],
  'CMPT 471': [P('Spring 2024', 'D100'), P('Summer 2024', 'D100', 'Mohamed Hefeeda'), P('Spring 2026', 'D100', 'Ouldooz Baghban Karimi'), P('Summer 2026', 'E100', 'Mohamed Hefeeda')],
  'CMPT 405': [P('Spring 2024', 'D100', 'Qianping Gu'), P('Fall 2024', 'D100', 'Qianping Gu'), P('Spring 2025', 'D100', 'Qianping Gu'), P('Fall 2025', 'D100')],
  'CMPT 362': [P('Fall 2024', 'D100', 'Xingdong Yang'), P('Fall 2025', 'D100', 'Xingdong Yang')],
  'CMPT 420': [P('Spring 2024', 'D100', 'Oliver Schulte'), P('Spring 2025', 'D100', 'Wuyang Chen'), P('Spring 2026', 'D100', 'Wuyang Chen')],
  'CMPT 412': [P('Fall 2024', 'D100', 'Yagiz Aksoy'), P('Spring 2025', 'D100', 'Andrea Tagliasacchi'), P('Spring 2026', 'D100', 'Richard Zhang')],
  'CMPT 417': [P('Fall 2024', 'D100', 'Hang Ma'), P('Fall 2025', 'D100', 'Hang Ma')],
  'CMPT 467': [P('Spring 2026', 'D100', 'Sheelagh Carpendale')],
  'CMPT 489': [
    P('Summer 2024', 'D100', 'Anders Miltner', 'Burnaby', 'Proofs, types and program synthesis'), P('Fall 2024', 'D100', 'Yuepeng Wang', 'Burnaby', 'Program synthesis'),
    P('Spring 2025', 'D100', undefined, 'Burnaby', 'Domain-specific languages'), P('Fall 2025', 'D100', 'Yuepeng Wang', 'Burnaby', 'Program synthesis'),
  ],
  'CMPT 494': [P('Fall 2025', 'D100'), P('Spring 2026', 'D100'), P('Summer 2026', 'D100'), P('Fall 2026', 'D100', 'Mohammad Tayebi')],
  'CMPT 318': [P('Spring 2024', 'D100', 'Uwe Glaesser'), P('Fall 2024', 'D100', 'Uwe Glaesser'), P('Spring 2025', 'D100', 'Uwe Glaesser'), P('Fall 2026', 'D100', 'Uwe Glaesser')],
  'CMPT 459': [P('Spring 2024', 'D100', 'Zhengjie Miao'), P('Fall 2024', 'D100', 'Martin Ester'), P('Spring 2025', 'D100', 'Tianzheng Wang'), P('Fall 2025', 'D100', 'Martin Ester')],
  'CMPT 455': [P('Fall 2026', 'D100', 'Martin Ester')],
  'MATH 308': [P('Fall 2025', 'D100', 'Ladislav Stacho'), P('Fall 2026', 'D100', 'Petr Lisonek')],
  'MATH 345': [P('Fall 2025', 'D100', 'Bojan Mohar'), P('Fall 2026', 'D100', 'Matthew DeVos')],
};

export interface Teacher {
  name: string;
  /** Terms they taught it, oldest first, e.g. ["Fall 2025", "Fall 2026"]. */
  terms: string[];
  /** Whether they teach it in Spring 2027. */
  spring2027: boolean;
  topics: string[];
  /** Each section they taught, for CourSys links. */
  offerings: { term: string; section: string }[];
}

function TERM_ORDER(t: string): number {
  const [season, year] = t.split(' ');
  return Number(year) * 3 + ['Spring', 'Summer', 'Fall'].indexOf(season);
}

/** Everyone who taught a course in 2024–2027, Spring 2027 included, with the terms they taught it. */
export function teachersOf(code: string): Teacher[] {
  const spring = (SPRING_2027.find((o) => o.code === code)?.sections ?? []).map((s) => ({ ...s, term: 'Spring 2027' }));
  const byName = new Map<string, Teacher>();
  for (const s of [...(PAST_SECTIONS[code] ?? []), ...spring]) {
    if (!s.instructor) continue;
    const t = byName.get(s.instructor) ?? { name: s.instructor, terms: [], spring2027: false, topics: [], offerings: [] };
    if (!t.terms.includes(s.term)) {
      t.terms.push(s.term);
      t.offerings.push({ term: s.term, section: s.section });
    }
    if (s.topic && !t.topics.includes(s.topic)) t.topics.push(s.topic);
    if (s.term === 'Spring 2027') t.spring2027 = true;
    byName.set(s.instructor, t);
  }
  for (const t of byName.values()) {
    t.terms.sort((a, b) => TERM_ORDER(a) - TERM_ORDER(b));
    t.offerings.sort((a, b) => TERM_ORDER(a.term) - TERM_ORDER(b.term));
  }
  return [...byName.values()];
}

/** "Fall" when every term they taught it was a Fall: when to look for them next. */
export function usualSeason(t: Teacher): string | null {
  const seasons = new Set(t.terms.map((x) => x.split(' ')[0]));
  return seasons.size === 1 ? [...seasons][0] : null;
}

export interface RatedPick extends PlanItem {
  term: TermKey;
  instructor: string;
  rating: number;
  /** Summer and Fall: the instructor who taught it in that season before, not a confirmed one. */
  expectedInstructor: boolean;
}

/**
 * A plan that favours well-rated instructors: each candidate (course, term) scores its instructor's
 * RMP rating plus a little for job value, and the best are taken greedily, 3 per term, keeping
 * CMPT 376W (required), no Spring clashes, nothing you can't take, nothing niche (value 1) and no
 * instructor rated under 3.5.
 * Summer and Fall instructors aren't known, so those use whoever taught it in that season in 2024–2026.
 */
/** Below this, an instructor's rating doesn't earn a course a place in the ratings plan. */
export const MIN_GOOD_RATING = 3.5;

export function recommendByRatings(ratingOf: (name: string) => number | null): { plan: Plan; picks: RatedPick[] } {
  const candidates: (RatedPick & { score: number })[] = [];
  const allowed = (code: string) => {
    const c = COURSES[code];
    const e = eligibility(c);
    return (e.status === 'eligible' || e.status === 'check') && (c.value >= 2 || code === 'CMPT 376W') && !/Capstone/.test(c.title);
  };
  for (const o of SPRING_2027) {
    if (!allowed(o.code)) continue;
    for (const s of o.sections) {
      const r = s.instructor ? ratingOf(s.instructor) : null;
      if (r === null || !s.instructor) continue;
      candidates.push({ code: o.code, section: s.section, term: 'spring', instructor: s.instructor, rating: r, expectedInstructor: false, score: r + 0.4 * COURSES[o.code].value });
    }
  }
  for (const term of ['summer', 'fall'] as const) {
    const season = term === 'summer' ? 'Summer' : 'Fall';
    for (const { code } of expected(term)) {
      if (!allowed(code)) continue;
      for (const t of teachersOf(code)) {
        if (!t.terms.some((x) => x.startsWith(season))) continue;
        const r = ratingOf(t.name);
        if (r === null) continue;
        candidates.push({ code, term, instructor: t.name, rating: r, expectedInstructor: true, score: r + 0.4 * COURSES[code].value });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  const plan: Plan = { spring: [], summer: [], fall: [] };
  const picks: RatedPick[] = [];
  const taken = new Set<string>();
  const fits = (c: RatedPick) => {
    if (taken.has(c.code) || plan[c.term].length >= 3) return false;
    return c.term !== 'spring' || clashes([...plan.spring, { code: c.code, section: c.section }]).length === 0;
  };
  const take = (c: RatedPick) => {
    const { code, section, term, instructor, rating, expectedInstructor } = c;
    plan[term].push(section ? { code, section } : { code });
    picks.push({ code, section, term, instructor, rating, expectedInstructor });
    taken.add(code);
  };
  // The required course first, in its best-rated term.
  const w = candidates.find((c) => c.code === 'CMPT 376W' && fits(c));
  if (w) take(w);
  // A poorly rated instructor is no reason to pick a course; those slots fill from the job-value plan.
  for (const c of candidates) if (picks.length < 9 && c.rating >= MIN_GOOD_RATING && fits(c)) take(c);
  // Too few ratings: fill from the job-value plan, then the swaps, then the most useful course that runs.
  for (const t of TERMS) {
    const offered = t.key === 'spring' ? SPRING_2027.map((o) => ({ code: o.code, section: o.sections[0].section })) : expected(t.key).map((e) => ({ code: e.code }));
    const fill: PlanItem[] = [
      ...RECOMMENDED[t.key],
      ...ALTERNATES.filter((a) => a.term === t.key).map((a) => offered.find((o) => o.code === a.code) ?? { code: a.code }),
      ...offered.filter((o) => allowed(o.code)).sort((a, b) => COURSES[b.code].value - COURSES[a.code].value),
    ];
    for (const i of fill) {
      if (plan[t.key].length < 3 && allowed(i.code) && !taken.has(i.code) && (t.key !== 'spring' || clashes([...plan.spring, i]).length === 0)) {
        plan[t.key].push(i);
        taken.add(i.code);
      }
    }
  }
  return { plan, picks };
}

/** The five best courses you can take each term, for software internships. */
export const TOP_FIVE: Record<TermKey, string[]> = {
  spring: ['CMPT 431', 'CMPT 410', 'CMPT 454', 'CMPT 471', 'CMPT 376W'],
  summer: ['CMPT 403', 'CMPT 479', 'CMPT 471', 'CMPT 419', 'CMPT 379'],
  fall: ['CMPT 431', 'CMPT 410', 'CMPT 373', 'CMPT 473', 'CMPT 413'],
};

/** Every 300- and 400-level course a term offers: Spring 2027's published list, or what Summer and Fall ran before. */
export function offeredIn(term: TermKey): string[] {
  return (term === 'spring' ? SPRING_2027.map((o) => o.code) : expected(term).map((e) => e.code)).sort(compareCodes);
}

/** Upper-division CMPT numbers SFU's outlines list for each past term. */
const CMPT_OFFERED: Record<string, string[]> = {
  'Spring 2024': ['300', '305', '307', '310', '318', '340', '353', '354', '361', '363', '365', '371', '372', '376W', '383', '404', '405', '409', '410', '413', '419', '420', '431', '433', '454', '459', '461', '469', '471', '474', '475', '476', '479', '494', '495'],
  'Summer 2024': ['300', '307', '310', '353', '354', '365', '371', '376W', '403', '454', '471', '478', '479', '489', '494', '495'],
  'Fall 2024': ['307', '310', '318', '340', '353', '354', '361', '362', '365', '371', '373', '376W', '383', '405', '409', '410', '412', '417', '431', '441', '450', '454', '459', '464', '469', '473', '475', '477', '479', '489', '494', '495'],
  'Spring 2025': ['303', '307', '310', '318', '340', '353', '354', '361', '363', '365', '371', '376W', '383', '384', '404', '405', '409', '410', '412', '413', '419', '420', '431', '433', '454', '459', '461', '466', '469', '475', '478', '479', '489', '494', '495'],
  'Summer 2025': PAST.summer[2025],
  'Fall 2025': PAST.fall[2025],
  'Spring 2026': ['303', '305', '307', '308', '310', '340', '354', '361', '363', '371', '376W', '383', '404', '407', '410', '412', '413', '419', '420', '431', '450', '454', '461', '466', '467', '469', '471', '473', '476', '479', '494', '495'],
  'Summer 2026': PAST.summer[2026],
  'Fall 2026': PAST.fall[2026],
};

/** The terms whose offerings are known for a subject, oldest first, with whether the course ran. */
export function offeringHistory(code: string): { term: string; ran: boolean }[] {
  const spring2027 = SPRING_2027.some((o) => o.code === code);
  if (code.startsWith('CMPT ')) {
    const n = code.slice(5);
    return [...Object.entries(CMPT_OFFERED).map(([term, list]) => ({ term, ran: list.includes(n) })), { term: 'Spring 2027', ran: spring2027 }];
  }
  // MATH, MACM and IAT: only Summer and Fall 2025–2026 and Spring 2027 were collected.
  return [
    ...(['Summer 2025', 'Fall 2025', 'Summer 2026', 'Fall 2026'] as const).map((term) => {
      const [season, year] = term.split(' ');
      return { term, ran: OTHER_PAST[season === 'Summer' ? 'summer' : 'fall'][Number(year) as 2025 | 2026].includes(code) };
    }),
    { term: 'Spring 2027', ran: spring2027 },
  ];
}

export interface UsualTerms {
  /** "Every Fall", "Spring & Fall", "Usually Spring", "Irregular" or "Rarely offered". */
  label: string;
  /** Which terms it ran in, out of how many known. */
  detail: string;
  tone: 'regular' | 'usual' | 'irregular';
}

/** When a course usually runs, from the terms SFU's outlines show. */
export function usualTerms(code: string): UsualTerms {
  const history = offeringHistory(code);
  const ran = history.filter((h) => h.ran).map((h) => h.term);
  const seasons = (['Spring', 'Summer', 'Fall'] as const).map((season) => {
    const seen = history.filter((h) => h.term.startsWith(season));
    return { season, seen: seen.length, ran: seen.filter((h) => h.ran).length };
  });
  const detail = ran.length
    ? `Ran ${ran.length} of the ${history.length} terms from ${history[0].term} to Spring 2027: ${ran.join(', ')}.`
    : `Not offered from ${history[0].term} to Spring 2027.`;
  const always = seasons.filter((s) => s.seen > 0 && s.ran === s.seen);
  const never = seasons.filter((s) => s.ran === 0);
  if (always.length && always.length + never.length === 3) {
    return { label: always.length === 3 ? 'Every term' : always.length === 1 ? `Every ${always[0].season}` : always.map((s) => s.season).join(' & '), detail, tone: 'regular' };
  }
  const usual = seasons.filter((s) => s.seen > 0 && s.ran / s.seen >= 2 / 3);
  if (usual.length) return { label: `Usually ${usual.map((s) => s.season).join(' & ')}`, detail, tone: 'usual' };
  return { label: ran.length <= 1 ? 'Rarely offered' : 'Irregular', detail, tone: 'irregular' };
}

export interface RatedOption {
  code: string;
  section?: string;
  instructor?: string;
  rating?: number;
  /** Summer and Fall: who taught it in that season before. */
  expectedInstructor: boolean;
}

/**
 * The best courses you can take each term by instructor rating, best first: each course scores its
 * best-rated instructor that term plus a little for job value. Unrated courses fill the rest by value.
 */
export function topRatedByTerm(ratingOf: (name: string) => number | null, n = 5): Record<TermKey, RatedOption[]> {
  const out = { spring: [], summer: [], fall: [] } as Record<TermKey, RatedOption[]>;
  const allowed = (code: string) => {
    const c = COURSES[code];
    const e = eligibility(c);
    return (e.status === 'eligible' || e.status === 'check') && c.value >= 2 && !/Capstone/.test(c.title);
  };
  for (const t of TERMS) {
    const options: (RatedOption & { score: number })[] = [];
    for (const code of offeredIn(t.key).filter(allowed)) {
      const value = COURSES[code].value;
      let best: RatedOption & { score: number } = { code, expectedInstructor: t.key !== 'spring', score: value * 0.4 - 10 };
      const people =
        t.key === 'spring'
          ? (SPRING_2027.find((o) => o.code === code)?.sections ?? []).map((s) => ({ name: s.instructor, section: s.section }))
          : teachersOf(code)
              .filter((x) => x.terms.some((y) => y.startsWith(t.label.split(' ')[0])))
              .map((x) => ({ name: x.name as string | undefined, section: undefined as string | undefined }));
      for (const p of people) {
        const r = p.name ? ratingOf(p.name) : null;
        if (r !== null && r + value * 0.4 > best.score) best = { code, section: p.section, instructor: p.name, rating: r, expectedInstructor: t.key !== 'spring', score: r + value * 0.4 };
      }
      options.push(best);
    }
    options.sort((a, b) => b.score - a.score || compareCodes(a.code, b.code));
    out[t.key] = options.slice(0, n).map(({ score: _score, ...o }) => o);
  }
  return out;
}
