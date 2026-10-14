// Starter content: the resume as it stood in Hyeonyoung_park_resume.docx (Sept 2026).
// Loaded once from the editor ("Load starter content") into an empty Firestore.
//
// The phone number is deliberately NOT here: this file ships in the public JS bundle.
// Add it in the editor under Profile, where it lives only in owner-only Firestore.

import type { Library, Profile } from '../model/types';

export const seedProfile: Profile = {
  name: 'Hyeonyoung Park',
  contacts: [
    { id: 'c-linkedin', kind: 'linkedin', label: 'hyeonyoung-park', href: 'https://www.linkedin.com/in/hyeonyoung-park/', isDefault: true },
    { id: 'c-gmail', kind: 'email', label: 'phyeony@gmail.com', href: 'mailto:phyeony@gmail.com', isDefault: true },
    { id: 'c-sfu', kind: 'email', label: 'hyeonyoung_park@sfu.ca', href: 'mailto:hyeonyoung_park@sfu.ca', isDefault: false },
    { id: 'c-github', kind: 'github', label: 'phyeony', href: 'https://github.com/phyeony', isDefault: true },
    { id: 'c-location', kind: 'location', label: 'Vancouver, BC', isDefault: true },
  ],
};

/** The public site has always shown the SFU address instead of Gmail. */
export const seedMainContactIds = ['c-linkedin', 'c-sfu', 'c-github', 'c-location'];

const items = (prefix: string, texts: string[]) =>
  texts.map((text, i) => ({ id: `${prefix}-${i + 1}`, text, isDefault: true }));

export const seedLibrary: Library = {
  skills: [
    { id: 'sk-fe', name: 'Front-End', items: items('sk-fe', ['React.js (3yrs)', 'Next.js', 'React Native', 'Expo', 'Vue']) },
    { id: 'sk-be', name: 'Back-End', items: items('sk-be', ['Node.js', 'Express.js', 'Spring Boot (3yrs)', 'Flask']) },
    { id: 'sk-db', name: 'Database', items: items('sk-db', ['MongoDB', 'AWS DynamoDB', 'PostgreSQL']) },
    { id: 'sk-infra', name: 'Infrastructure', items: items('sk-infra', ['Bash', 'Argo', 'AWS (SAM, Cognito, S3, Lambda)', 'Docker']) },
    { id: 'sk-lang', name: 'Language', items: items('sk-lang', ['HTML', 'CSS', 'SQL', 'Javascript (5yrs)', 'Java (3yrs)', 'Python', 'C']) },
    { id: 'sk-other', name: 'Others', items: items('sk-other', ['Git', 'Pandas', 'BeagleBone']) },
  ],
  entries: [
    {
      id: 'e-kaf',
      section: 'work',
      title: 'Software Developer',
      org: 'Korea Air Force',
      dates: 'November 2024 – August 2026',
      isDefault: true,
      bullets: [
        { id: 'b-kaf-1', isDefault: true, text: 'Architected a closed-network geospatial C2 system for reconnaissance assets, featuring mission scheduling, LOS-based POI identification, AI-driven target recommendations, and ARIA encryption under strict defense compliance' },
        { id: 'b-kaf-2', isDefault: true, text: 'Accelerated schedule update latency by **90% (10s → 1s)** by replacing full entity loads with EXISTS existence checks' },
        { id: 'b-kaf-3', isDefault: true, text: 'Developed a high-performance Vue spreadsheet component featuring server-side pagination, full-text search, multi-column filtering, infinite scroll, keyboard navigation, and inline editing' },
        { id: 'b-kaf-4', isDefault: true, text: 'Reduced bulk record upload latency by **70% (10s → 3s)** and eliminated UI freezes on **10K+** CSV imports by offloading parsing to Web Workers and bypassing Vue reactivity' },
        { id: 'b-kaf-5', isDefault: true, text: 'Streamed LLM output via EventSource API for real-time progress tracking of AI mission-target matching' },
      ],
    },
    {
      id: 'e-cambian',
      section: 'work',
      title: 'Application Developer',
      org: 'Cambian Business Service Inc, BC',
      dates: 'November 2022 – July 2024',
      isDefault: true,
      bullets: [
        { id: 'b-cam-1', isDefault: true, text: 'Built Node.js Lambda functions for efficient DynamoDB and S3 integration using SAM templates for easy deployment' },
        { id: 'b-cam-2', isDefault: true, text: 'Migrated React.js project to **Next.js** 13 App Router for improved security, SEO, and caching' },
      ],
    },
    {
      id: 'e-scotia',
      section: 'work',
      title: 'DevOps Intern',
      org: 'Scotiabank, ON',
      dates: 'September 2021 – June 2022',
      isDefault: true,
      bullets: [
        { id: 'b-sco-1', isDefault: true, text: 'Built CI/CD pipelines for Node.js services using **Argo Workflows** and **Docker**, cutting build and execution times by **40%** compared to legacy Jenkins jobs' },
        { id: 'b-sco-1b', isDefault: false, text: 'Built a CI/CD strategy for Node.js projects, leveraging **Argo** Workflow Templates with **Docker** containers and custom **Bash** scripts, resulting in a **12%** reduction in company expenses' },
        { id: 'b-sco-2', isDefault: true, text: 'Implemented Docker image for Helm chart validation, packaging, and publishing to artifact repository, enabling Kubernetes deployment in CD pipeline' },
        { id: 'b-sco-3', isDefault: true, text: 'Wrote performance tests in **Python** for a service that delivers 800 internal projects to ensure **3 seconds** response rate' },
        { id: 'b-sco-4', isDefault: true, text: 'Created deployment strategy for state machine in Spring Boot backend to trigger CD pipeline' },
      ],
    },
    {
      id: 'e-eduqa',
      section: 'projects',
      title: 'Edu Q&A',
      stack: 'AWS Amplify, API Gateway, Lambda, S3, Cognito, DynamoDB',
      dates: 'March 2023',
      isDefault: true,
      bullets: [
        { id: 'b-eduqa-1', isDefault: true, text: 'Migrated an existing Express.js backend codebase to utilize AWS services, including Amplify for static React.js hosting, API Gateway, Lambda, S3 bucket for image files, Cognito for authentication, and DynamoDB' },
      ],
    },
    {
      id: 'e-cradle',
      section: 'projects',
      title: 'Cradle',
      stack: 'React.js, Flask, Docker, Caddy, Fluentbit, AWS CloudWatch',
      dates: 'October 2022',
      isDefault: true,
      bullets: [
        { id: 'b-cradle-1', isDefault: true, text: 'Implemented a centralized log management system by leveraging the **Fluentbit** to gather logs from Caddy, Flask, and MySQL Docker containers, and forwarding them to **AWS CloudWatch**' },
      ],
    },
    {
      id: 'e-bridgeburma',
      section: 'projects',
      title: 'BridgeBurma',
      stack: 'React.js',
      dates: 'May 2021 – September 2021',
      isDefault: true,
      bullets: [
        { id: 'b-bb-1', isDefault: true, text: 'Improved UX for 400+ students globally on React.js platform by optimizing routing and adding skeleton loaders' },
      ],
    },
    {
      id: 'e-byo',
      section: 'projects',
      title: 'BYO (Bring Your Own Cup)',
      stack: 'Expo, Express, Firebase',
      dates: 'September 2020 – September 2021',
      isDefault: true,
      bullets: [
        { id: 'b-byo-1', isDefault: true, text: 'Built full-stack Expo mobile app with JWT/Google OAuth 2.0 via Express/Firebase' },
      ],
    },
    {
      id: 'e-sfu',
      section: 'education',
      title: 'Bachelor of Science in Computer Science',
      org: 'Simon Fraser University, Burnaby, BC',
      orgRight: 'GPA: 3.40 / 4.33',
      dates: 'May 2019 – December 2027',
      isDefault: true,
      bullets: [
        { id: 'b-sfu-1', isDefault: true, text: '**Courses:** OS, Data Structures & Algorithm, Networking, Database, Web Architecture, Data Science, Embedded System' },
      ],
    },
  ],
};
