import { useEffect, type MouseEvent as ReactMouseEvent } from "react";
import "./AnimeExtras.css";

export function YoutubeTrailerModal({
  id,
  title,
  onClose,
}: {
  id: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);
  return (
    <div
      className="at-trailer-backdrop"
      onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="at-trailer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Trailer de ${title}`}
      >
        <div className="at-trailer-heading">
          <h2>Trailer • {title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar trailer">
            ×
          </button>
        </div>
        <div className="at-trailer-ratio">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={`Trailer de ${title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <div className="at-trailer-footer">
          Se o vídeo estiver bloqueado para incorporação,{" "}
          <a
            href={`https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            assista diretamente no YouTube ↗
          </a>
          .
        </div>
      </section>
    </div>
  );
}
