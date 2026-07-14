import { projects } from '../../content/projects'
import { ModalShell } from './ModalShell'

export function ProjectsModal() {
  return (
    <ModalShell title="Projects" wide>
      <ul className="space-y-4">
        {projects.map((project) => (
          <li key={project.title} className="rounded-xl border border-ink/10 p-4">
            <h3 className="font-display text-lg font-semibold">{project.title}</h3>
            <p className="mt-1 leading-relaxed">{project.blurb}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {project.tech.map((t) => (
                <li key={t} className="rounded-full bg-lagoon/15 px-2.5 py-0.5 text-xs font-semibold text-deepwater">
                  {t}
                </li>
              ))}
            </ul>
            {(project.link || project.repo) && (
              <p className="mt-3 flex gap-3 text-sm font-semibold">
                {project.link && (
                  <a href={project.link} target="_blank" rel="noreferrer" className="text-deepwater underline focus-visible:outline-2 focus-visible:outline-deepwater">
                    Visit
                  </a>
                )}
                {project.repo && (
                  <a href={project.repo} target="_blank" rel="noreferrer" className="text-deepwater underline focus-visible:outline-2 focus-visible:outline-deepwater">
                    View code
                  </a>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </ModalShell>
  )
}
