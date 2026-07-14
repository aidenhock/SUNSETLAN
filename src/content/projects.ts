export interface Project {
  title: string
  blurb: string
  tech: string[]
  link?: string
  repo?: string
}

export const projects: Project[] = [
  {
    title: 'Pipeline placeholder',
    blurb: 'An ETL pipeline write-up goes here — sources, transforms, and the dashboard it feeds.',
    tech: ['Python', 'SQL', 'Airflow'],
    repo: 'https://github.com/aidenhock',
  },
  {
    title: 'Flask app placeholder',
    blurb: 'A small web app case study goes here — what it does and what was tricky.',
    tech: ['Flask', 'PostgreSQL'],
  },
  {
    title: 'This island',
    blurb: 'The site you are standing on: a rotating-planet portfolio built with React Three Fiber.',
    tech: ['TypeScript', 'three.js', 'R3F'],
    repo: 'https://github.com/aidenhock/sunsetLan',
  },
]
