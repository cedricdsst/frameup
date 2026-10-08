import { listProjects } from "../../lib/project-store";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main className="projects-page">
      <header className="topbar">
        <a className="brand" href="/"><span>F</span> FRAMEUP</a>
        <a className="button dark project-create" href="/">+ Nouveau projet</a>
      </header>
      <section className="projects-shell">
        <div className="projects-heading">
          <div>
            <span className="eyebrow">ESPACE DE TRAVAIL</span>
            <h1>Mes projets</h1>
            <p>Reprenez une cover exactement là où vous l’avez laissée.</p>
          </div>
          <span className="projects-count">{projects.length} projet{projects.length > 1 ? "s" : ""}</span>
        </div>

        {projects.length ? (
          <div className="projects-grid">
            {projects.map((project) => (
              <a className="project-card" href={`/studio/${project.id}`} key={project.id}>
                <div className="project-thumbnail" style={{ background: project.background }}>
                  {project.previewImage
                    ? <img src={project.previewImage} alt="" />
                    : <span>{project.title.slice(0, 1) || "F"}</span>}
                  <i>{project.generatedCount}/{project.cardCount + 1}</i>
                </div>
                <div className="project-card-copy">
                  <h2>{project.title || "Projet sans titre"}</h2>
                  <p>{project.brief}</p>
                  <div><span>{project.cardCount} sujet{project.cardCount > 1 ? "s" : ""}</span><time dateTime={project.updatedAt}>Modifié le {formatDate(project.updatedAt)}</time></div>
                </div>
                <strong aria-hidden="true">→</strong>
              </a>
            ))}
          </div>
        ) : (
          <div className="projects-empty">
            <span>F</span>
            <h2>Aucun projet pour le moment</h2>
            <p>Décrivez votre première vidéo et FrameUp préparera tout le studio.</p>
            <a className="button accent" href="/">Créer mon premier projet</a>
          </div>
        )}
      </section>
    </main>
  );
}
