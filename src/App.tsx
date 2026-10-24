import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Home,
  Clapperboard,
  Tv,
  Orbit,
  History,
  FolderOpen,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Play,
  Check,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderPlus,
  Grid2X2,
  List,
  SlidersHorizontal,
  X,
  AlertCircle,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  HardDrive,
  LoaderCircle,
  Film,
  Flame,
  Trash2,
  CheckCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  collections,
  demoLibrary,
  emptyLibrary,
  episodeLabel,
  kindLabel,
  nextToWatch,
  progress,
  time,
} from "./model";
import type { Collection, Kind, Library, Media } from "./model";
import Artwork from "./Artwork";
import Player from "./Player";
import Onboarding, { type RuntimeInfo } from "./Onboarding";
import Maintenance from "./Maintenance";
import useFullscreen from "./useFullscreen";

type View =
  | "home"
  | "movie"
  | "series"
  | "anime"
  | "history"
  | "review"
  | "folders"
  | "settings";
const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "movie", label: "Filmes", icon: Clapperboard },
  { id: "series", label: "Séries", icon: Tv },
  { id: "anime", label: "Animes", icon: Orbit },
  { id: "history", label: "Histórico", icon: History },
];
const titles: Record<View, [string, string]> = {
  home: [
    "Sua próxima sessão",
    "Um lugar para tudo que você gosta de assistir.",
  ],
  movie: ["Filmes", "Grandes histórias, no seu tempo."],
  series: ["Séries", "Cada episódio, no lugar certo."],
  anime: ["Animes", "Um novo universo a cada episódio."],
  history: ["Seu histórico", "O caminho das histórias que você já começou."],
  review: [
    "Revisar identificação",
    "Organize os arquivos que precisam de um olhar seu.",
  ],
  folders: [
    "Suas pastas",
    "O Lume organiza. Seus arquivos continuam onde estão.",
  ],
  settings: ["Configurações", "Tudo pronto para a sua próxima sessão."],
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    const handle = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener("cancel", handle);
    return () => el?.removeEventListener("cancel", handle);
  }, []);
  return (
    <dialog
      className="modal"
      ref={dialog}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-btn" title="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [library, setLibrary] = useState<Library>(emptyLibrary),
    [view, setView] = useState<View>("home"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("title"),
    [list, setList] = useState(false),
    [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [mpv, setMpv] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [detail, setDetail] = useState<Collection | null>(null),
    [edit, setEdit] = useState<Media[] | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [removeMedia, setRemoveMedia] = useState<Media[] | null>(null),
    [selected, setSelected] = useState<Set<number>>(new Set()),
    [active, setActive] = useState<{ media: Media; restart: boolean } | null>(
      null,
    ),
    [season, setSeason] = useState("all");
  const search = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const desktop = isTauri();
  const notify = (text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 10000 : 5000);
  };
  const reload = async () => {
    if (!desktop) return;
    const data = await invoke<Library>("library_load");
    setLibrary(data);
    setDetail((current) =>
      current
        ? (collections(data.media).find((c) =>
            c.items.some((m) => current.items.some((old) => old.id === m.id)),
          ) ?? null)
        : null,
    );
    setMpv(await invoke<string | null>("mpv_status"));
  };
  const { fullscreen, toggleFullscreen } = useFullscreen((message) =>
    notify(message, true),
  );
  useEffect(() => {
    void reload()
      .then(async () => {
        if (desktop) {
          const status = await invoke<RuntimeInfo>("app_status");
          setRuntime(status);
          setShowOnboarding(!status.onboardingComplete);
        }
      })
      .catch((e) => notify(String(e), true))
      .finally(() => setLoading(false));
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const all = useMemo(() => collections(library.media), [library.media]);
  const underway = library.media
    .filter((m) => m.position > 0 && !m.watched)
    .sort((a, b) => b.updated - a.updated);
  const reviewCount = library.media.filter((m) => m.review).length;
  const groups = useMemo(
    () =>
      all
        .filter((c) => {
          if (["movie", "series", "anime"].includes(view) && c.kind !== view)
            return false;
          if (
            query &&
            !`${c.title} ${c.items.map((i) => i.filename).join(" ")}`
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR"))
          )
            return false;
          if (
            filter === "watching" &&
            !c.items.some((m) => m.position > 0 && !m.watched)
          )
            return false;
          if (
            filter === "unwatched" &&
            !c.items.some((m) => !m.watched && m.position === 0)
          )
            return false;
          if (filter === "watched" && !c.items.every((m) => m.watched))
            return false;
          return true;
        })
        .sort((a, b) =>
          sort === "recent"
            ? Math.max(...b.items.map((m) => m.updated)) -
              Math.max(...a.items.map((m) => m.updated))
            : a.title.localeCompare(b.title, "pt-BR", { numeric: true }),
        ),
    [all, view, query, filter, sort],
  );
  const navigate = (v: View) => {
    setView(v);
    setQuery("");
    setFilter("all");
    setSelected(new Set());
  };
  const addFolder = async () => {
    if (demo) {
      notify("Saia da demonstração para adicionar seus arquivos.");
      return;
    }
    if (!desktop) {
      notify("Abra a versão desktop do Lume para escolher suas pastas.", true);
      return;
    }
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: "Escolha uma pasta com seus filmes ou séries",
      });
      if (typeof folder !== "string") return;
      setBusy(true);
      const report = await invoke<{ found: number; warnings: string[] }>(
        "folder_scan",
        { path: folder, restoreRemoved: true },
      );
      await reload();
      notify(
        `${report.found} arquivo${report.found === 1 ? " encontrado" : "s encontrados"}.${report.warnings.length ? ` ${report.warnings.length} pasta(s) não puderam ser lidas. Verifique as permissões e tente atualizar novamente.` : ""}`,
        !!report.warnings.length,
      );
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const rescan = async () => {
    if (demo) {
      notify("Esta é uma biblioteca de demonstração.");
      return;
    }
    setBusy(true);
    try {
      let total = 0;
      let warnings = 0;
      for (const path of library.folders) {
        try {
          const r = await invoke<{ found: number; warnings: string[] }>(
            "folder_scan",
            { path },
          );
          total += r.found;
          warnings += r.warnings.length;
        } catch {
          warnings++;
        }
      }
      await reload();
      notify(
        `Biblioteca atualizada: ${total} arquivos.${warnings ? ` ${warnings} pasta(s) indisponível(is) ou sem permissão. Arquivos ausentes mantêm o histórico e podem ser removidos do catálogo.` : ""}`,
        warnings > 0,
      );
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const showDetail = (c: Collection) => {
    setSeason("all");
    setDetail(c);
  };
  const play = async (m: Media, restart = false) => {
    if (demo) {
      notify(
        "Os títulos da demonstração são fictícios. Adicione seus vídeos para reproduzir.",
      );
      return;
    }
    try {
      await invoke("media_check", { id: m.id });
    } catch (e) {
      setDetail(null);
      setActive(null);
      await reload();
      notify(String(e), true);
      return;
    }
    if (!mpv) {
      setDetail(null);
      navigate("settings");
      notify("Selecione o mpv.exe para começar a assistir.", true);
      return;
    }
    setDetail(null);
    setActive({ media: m, restart });
  };
  const mark = async (m: Media) => {
    if (demo) {
      notify("Esta ação está disponível na sua biblioteca.");
      return;
    }
    try {
      await invoke("media_mark", { id: m.id, watched: !m.watched });
      await reload();
      setDetail(null);
      notify(
        m.watched
          ? "Episódio marcado como não assistido."
          : "Marcado como assistido.",
      );
    } catch (e) {
      notify(String(e), true);
    }
  };
  const configureMpv = async () => {
    if (demo) {
      notify("Saia da demonstração para configurar o player.");
      return;
    }
    if (!desktop) {
      notify(
        "A configuração do player está disponível na versão desktop.",
        true,
      );
      return;
    }
    try {
      const path = await open({
        title: "Selecione o mpv.exe",
        filters: [{ name: "Player mpv", extensions: ["exe"] }],
      });
      if (typeof path === "string") {
        await invoke("mpv_configure", { path });
        await reload();
        notify("Player configurado. Boa sessão!");
      }
    } catch (e) {
      notify(String(e), true);
    }
  };
  const exitDemo = async () => {
    setDemo(false);
    setLibrary(emptyLibrary);
    navigate("home");
    await reload();
  };
  const editItems = (items: Media[]) => {
    if (demo) {
      notify("Correções ficam disponíveis quando você adiciona seus arquivos.");
      return;
    }
    setDetail(null);
    setEdit(
      [...items].sort((a, b) =>
        a.filename.localeCompare(b.filename, undefined, { numeric: true }),
      ),
    );
  };
  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const set = new Set(prev);
      set.has(id) ? set.delete(id) : set.add(id);
      return set;
    });
  const hero = underway[0] ?? (all.length ? nextToWatch(all[0]) : undefined);
  const heroResume = !!hero && hero.position > 0 && !hero.watched;
  if (showOnboarding && runtime && !loading)
    return (
      <Onboarding
        initial={runtime}
        onDone={async () => {
          await reload();
          setRuntime(await invoke<RuntimeInfo>("app_status"));
          setShowOnboarding(false);
        }}
      />
    );
  if (active) {
    const group = collections(library.media).find((c) =>
      c.items.some((m) => m.id === active.media.id),
    );
    const idx = group?.items.findIndex((m) => m.id === active.media.id) ?? -1;
    const next = group?.items.slice(idx + 1).find((m) => !m.missing);
    return (
      <Player
        key={active.media.id}
        media={active.media}
        restart={active.restart}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onClose={() => {
          setActive(null);
          void reload().catch((e) => notify(String(e), true));
        }}
        onNext={next ? () => void play(next) : undefined}
      />
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
          aria-label="Lume, início"
        >
          <span className="brand-icon">
            <Flame size={28} fill="currentColor" strokeWidth={1.2} />
          </span>
          <span>
            lume<span className="brand-period">.</span>
          </span>
        </a>
        <div className="sidebar-label">SUA BIBLIOTECA</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${view === id ? "active" : ""}`}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {["movie", "series", "anime"].includes(id) && (
                <span className="nav-count">
                  {all.filter((c) => c.kind === id).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">ORGANIZAR</div>
        <nav>
          <button
            className={`nav-item ${view === "folders" ? "active" : ""}`}
            onClick={() => navigate("folders")}
          >
            <FolderOpen size={19} />
            <span>Pastas</span>
            <span className="nav-count">{library.folders.length}</span>
          </button>
          <button
            className={`nav-item ${view === "review" ? "active" : ""}`}
            onClick={() => navigate("review")}
          >
            <SlidersHorizontal size={19} />
            <span>Revisar arquivos</span>
            {reviewCount > 0 && (
              <span className="review-badge">{reviewCount}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="status-dot" />
            <span>
              Sua biblioteca é local<small>Seus arquivos. Seu espaço.</small>
            </span>
            <HardDrive size={16} />
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} />
            <span>Configurações</span>
          </button>
          <div className="sidebar-version">
            LUME PARA WINDOWS <span>v{runtime?.version ?? "0.1.7"}</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Biblioteca <ChevronRight size={13} />{" "}
            <span>{view === "home" ? "Visão geral" : titles[view][0]}</span>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={17} />
              <input
                ref={search}
                placeholder="Buscar na biblioteca"
                aria-label="Buscar na biblioteca"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (["settings", "folders", "review"].includes(view))
                    setView("home");
                }}
              />
              {query ? (
                <button
                  className="search-clear"
                  title="Limpar busca"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </div>
            <button
              className="icon-btn refresh-btn"
              title="Atualizar biblioteca"
              disabled={busy || !library.folders.length}
              onClick={() => void rescan()}
            >
              <RefreshCw size={18} className={busy ? "spin" : ""} />
            </button>
            <button
              className="button small"
              disabled={busy}
              onClick={() => void addFolder()}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Plus size={16} />
              )}
              Adicionar pasta
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" /> Modo demonstração{" "}
              <span className="demo-note">
                — títulos fictícios para explorar a interface
              </span>
            </span>
            <button onClick={() => void exitDemo()}>
              Voltar à minha biblioteca <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "home" ? "BEM-VINDO AO SEU CINEMA" : "A SUA COLEÇÃO"}
              </div>
              <h1>
                {titles[view][0]}
                <span className="accent">.</span>
              </h1>
              <p>{titles[view][1]}</p>
            </div>
            {all.length > 0 &&
              ["home", "movie", "series", "anime"].includes(view) && (
                <div className="collection-summary">
                  <strong>{all.length}</strong>
                  <span>
                    histórias
                    <br />
                    na sua biblioteca
                  </span>
                </div>
              )}
          </div>
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={28} />
              <h3>Abrindo sua biblioteca…</h3>
            </div>
          ) : (
            <>
              {view === "home" && !query && filter === "all" && (
                <section
                  className={`hero ${hero ? "has-media" : "welcome-hero"}`}
                >
                  <div className="hero-art">
                    <Artwork title={hero?.title ?? "Além da órbita"} wide />
                  </div>
                  <div className="hero-shade" />
                  <div className="hero-content">
                    <div className="hero-kicker">
                      <span className="tiny-line" />
                      {hero
                        ? heroResume
                          ? "SUA HISTÓRIA CONTINUA"
                          : "PRONTO PARA O PRÓXIMO PLAY"
                        : "FEITO PARA A SUA COLEÇÃO"}
                    </div>
                    <h2>
                      {hero ? (
                        hero.title
                      ) : (
                        <>
                          Dê um lar às
                          <br />
                          suas histórias.
                        </>
                      )}
                    </h2>
                    <p>
                      {hero
                        ? `${kindLabel[hero.kind]}${hero.kind === "movie" ? "" : ` · ${episodeLabel(hero)}`}${heroResume ? ` · Parou em ${time(hero.position)}` : ""}`
                        : "Filmes, séries e animes. Tudo organizado, com o próximo play exatamente de onde você parou."}
                    </p>
                    <div className="hero-buttons">
                      {hero ? (
                        <>
                          <button className="button" onClick={() => play(hero)}>
                            <Play size={17} fill="currentColor" />
                            {heroResume
                              ? "Continuar assistindo"
                              : "Assistir agora"}
                          </button>
                          <button
                            className="button glass"
                            onClick={() =>
                              showDetail(
                                all.find((c) =>
                                  c.items.some((m) => m.id === hero.id),
                                )!,
                              )
                            }
                          >
                            {hero.kind === "movie"
                              ? "Ver detalhes"
                              : "Ver episódios"}{" "}
                            <ArrowUpRight size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="button"
                            onClick={() => void addFolder()}
                            disabled={busy}
                          >
                            <FolderPlus size={17} />
                            Escolher minha primeira pasta
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setLibrary(demoLibrary);
                              setDemo(true);
                            }}
                          >
                            Explorar demonstração <ArrowRight size={16} />
                          </button>
                        </>
                      )}
                    </div>
                    {hero && heroResume && (
                      <div className="hero-progress">
                        <div>
                          <i style={{ width: `${progress(hero)}%` }} />
                        </div>
                        <span>
                          {time(hero.position)}{" "}
                          <span>/ {time(hero.duration)}</span>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="hero-caption">
                    <span className="hero-caption-line" />{" "}
                    {hero
                      ? "A próxima cena espera por você."
                      : "Sua sessão, do seu jeito."}
                  </div>
                </section>
              )}
              {view === "home" && !query && underway.length > 0 && (
                <section className="continue-section">
                  <div className="section-heading">
                    <h2>
                      De onde você parou <span>{underway.length}</span>
                    </h2>
                    <button
                      className="text-button muted"
                      onClick={() => navigate("history")}
                    >
                      Ver histórico <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="continue-grid">
                    {underway.slice(0, 3).map((m) => (
                      <button
                        key={m.id}
                        className="continue-card"
                        onClick={() => play(m)}
                      >
                        <div className="continue-image">
                          <Artwork title={m.title} wide />
                          <span className="mini-play">
                            <Play size={17} fill="currentColor" />
                          </span>
                          <span className="remaining">
                            {m.duration > m.position
                              ? `${Math.ceil((m.duration - m.position) / 60)} min restantes`
                              : time(m.position)}
                          </span>
                          <span className="continue-line">
                            <i style={{ width: `${progress(m)}%` }} />
                          </span>
                        </div>
                        <div className="continue-info">
                          <strong>{m.title}</strong>
                          <span>
                            {episodeLabel(m)} <span>·</span> {time(m.position)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {["home", "movie", "series", "anime"].includes(view) && (
                <section className="library-section">
                  <div className="section-heading library-heading">
                    <h2>
                      {query
                        ? "Resultados da busca"
                        : view === "home"
                          ? "Toda a sua biblioteca"
                          : `${view === "series" ? "Suas" : "Seus"} ${view === "movie" ? "filmes" : view === "series" ? "séries" : "animes"}`}{" "}
                      <span>{groups.length}</span>
                    </h2>
                    <div className="view-toggle">
                      <button
                        className={!list ? "selected" : ""}
                        title="Visualização em grade"
                        onClick={() => setList(false)}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        className={list ? "selected" : ""}
                        title="Visualização em lista"
                        onClick={() => setList(true)}
                      >
                        <List size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="filterbar">
                    <div className="filter-tabs">
                      {[
                        ["all", "Todos"],
                        ["watching", "Em andamento"],
                        ["unwatched", "Não assistidos"],
                        ["watched", "Concluídos"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? "selected" : ""}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="sort-label">
                      Ordenar por{" "}
                      <select
                        aria-label="Ordenar biblioteca"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="title">Título</option>
                        <option value="recent">Último acesso</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  </div>
                  {groups.length > 0 ? (
                    <div className={list ? "media-list" : "poster-grid"}>
                      {groups.map((c) => (
                        <button
                          key={c.key}
                          className={`media-card ${list ? "as-list" : ""}`}
                          onClick={() => showDetail(c)}
                        >
                          <div className="poster">
                            <Artwork title={c.title} />
                            <div className="poster-top">
                              <span className="type-tag">
                                {kindLabel[c.kind]}
                              </span>
                              {c.items.every((m) => m.watched) && (
                                <span className="watched-tag" title="Concluído">
                                  <Check size={13} />
                                </span>
                              )}
                            </div>
                            <div className="poster-title">
                              <span>COLEÇÃO PESSOAL</span>
                              <strong>{c.title}</strong>
                              <i />
                            </div>
                            <div className="poster-hover">
                              <span>
                                <Play size={24} fill="currentColor" />
                              </span>
                              <small>Ver detalhes</small>
                            </div>
                            {c.items.every((m) => m.missing) && (
                              <span className="unavailable-tag">
                                Indisponível
                              </span>
                            )}
                          </div>
                          <div className="card-caption">
                            <h3>{c.title}</h3>
                            <p>
                              {c.kind === "movie"
                                ? c.items[0].duration
                                  ? `${Math.round(c.items[0].duration / 60)} min`
                                  : "Arquivo local"
                                : `${c.items.length} episódio${c.items.length === 1 ? "" : "s"}${c.items.some((m) => m.season !== null) ? ` · ${new Set(c.items.map((m) => m.season).filter((s) => s !== null)).size} temporada(s)` : ""}`}
                            </p>
                          </div>
                          {list && (
                            <span className="list-status">
                              {c.items.every((m) => m.watched)
                                ? "Concluído"
                                : c.items.some((m) => m.position > 0)
                                  ? "Em andamento"
                                  : "Não assistido"}
                              <ChevronRight size={18} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : library.media.length === 0 ? (
                    <div className="first-steps">
                      <div className="step">
                        <span>01</span>
                        <FolderPlus />
                        <div>
                          <h3>Escolha suas pastas</h3>
                          <p>Adicione onde você guarda seus vídeos.</p>
                        </div>
                      </div>
                      <div className="step">
                        <span>02</span>
                        <SlidersHorizontal />
                        <div>
                          <h3>A gente organiza</h3>
                          <p>Temporadas e episódios, com opção de ajustar.</p>
                        </div>
                      </div>
                      <div className="step">
                        <span>03</span>
                        <Play />
                        <div>
                          <h3>É só dar o play</h3>
                          <p>Sua próxima sessão começa onde você parou.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Empty
                      icon={Search}
                      title="Nenhuma história por aqui"
                      description="Tente outro termo ou ajuste os filtros."
                    />
                  )}
                </section>
              )}
              {view === "history" &&
                (library.media.some((m) => m.updated > 0) ? (
                  <div className="history-list">
                    {library.media
                      .filter(
                        (m) =>
                          m.updated > 0 &&
                          (!query ||
                            m.title
                              .toLowerCase()
                              .includes(query.toLowerCase())),
                      )
                      .sort((a, b) => b.updated - a.updated)
                      .map((m) => (
                        <div className="history-row" key={m.id}>
                          <button
                            className="history-art"
                            aria-label={`Reproduzir ${m.title}`}
                            onClick={() => play(m)}
                          >
                            <Artwork title={m.title} wide />
                            <Play size={19} fill="currentColor" />
                          </button>
                          <div className="history-title">
                            <strong>{m.title}</strong>
                            <span>
                              {episodeLabel(m)} ·{" "}
                              {m.watched
                                ? "Assistido"
                                : `Parou em ${time(m.position)}`}
                            </span>
                          </div>
                          <div className="history-progress">
                            <div className="thin-progress">
                              <i style={{ width: `${progress(m)}%` }} />
                            </div>
                            <small>
                              {m.watched
                                ? "Concluído"
                                : `${time(m.position)}${m.duration ? ` / ${time(m.duration)}` : ""}`}
                            </small>
                          </div>
                          <button
                            className="button secondary small"
                            onClick={() => play(m, m.watched)}
                          >
                            <Play size={14} />
                            {m.watched ? "Rever" : "Continuar"}
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty
                    icon={History}
                    title="Toda história tem um começo"
                    description="Seu histórico aparece aqui assim que você começar a assistir."
                  />
                ))}
              {view === "review" && (
                <>
                  <div className="info-panel">
                    <SlidersHorizontal size={21} />
                    <p>
                      Reconhecemos nomes como <code>S01E03</code> e{" "}
                      <code>1x03</code>. Arquivos sem identificação clara
                      aparecem aqui. Você pode corrigir vários episódios de uma
                      vez.
                    </p>
                  </div>
                  {selected.size > 0 && (
                    <div className="selection-bar">
                      <span>{selected.size} arquivo(s) selecionado(s)</span>
                      <button
                        className="button small"
                        onClick={() =>
                          editItems(
                            library.media.filter((m) => selected.has(m.id)),
                          )
                        }
                      >
                        <Pencil size={14} />
                        Editar seleção
                      </button>
                    </div>
                  )}
                  {reviewCount > 0 ? (
                    <div className="review-table">
                      <div className="review-table-head">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos os arquivos para revisar"
                          checked={selected.size === reviewCount}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(
                                    library.media
                                      .filter((m) => m.review)
                                      .map((m) => m.id),
                                  )
                                : new Set(),
                            )
                          }
                        />
                        <span>ARQUIVO</span>
                        <span>IDENTIFICAÇÃO ATUAL</span>
                        <span />
                      </div>
                      {library.media
                        .filter((m) => m.review)
                        .map((m) => (
                          <div className="review-row" key={m.id}>
                            <input
                              aria-label={`Selecionar ${m.filename}`}
                              type="checkbox"
                              checked={selected.has(m.id)}
                              onChange={() => toggleSelect(m.id)}
                            />
                            <div>
                              <strong>{m.filename}</strong>
                              <small title={m.path}>{m.root}</small>
                            </div>
                            <span>
                              {kindLabel[m.kind]} · {m.title}
                            </span>
                            <button
                              className="icon-btn"
                              title={`Corrigir ${m.filename}`}
                              onClick={() => editItems([m])}
                            >
                              <Pencil size={17} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      icon={CheckCheck}
                      title="Tudo no seu lugar"
                      description="Não há arquivos aguardando identificação."
                    />
                  )}
                </>
              )}
              {view === "folders" && (
                <>
                  <div className="section-heading">
                    <h2>
                      Fontes da biblioteca <span>{library.folders.length}</span>
                    </h2>
                    <button
                      className="button secondary small"
                      onClick={() => void addFolder()}
                      disabled={busy}
                    >
                      <Plus size={15} />
                      Adicionar pasta
                    </button>
                  </div>
                  {library.folders.length ? (
                    <div className="folders-list">
                      {library.folders.map((path) => (
                        <div className="folder-row" key={path}>
                          <span className="folder-symbol">
                            <FolderOpen size={27} />
                          </span>
                          <div>
                            <h3>
                              {path.replace(/\\$/, "").split(/[\\/]/).pop()}
                            </h3>
                            <p title={path}>{path}</p>
                            <small>
                              {
                                library.media.filter((m) => m.root === path)
                                  .length
                              }{" "}
                              arquivos catalogados
                            </small>
                          </div>
                          <button
                            className="icon-btn"
                            title="Remover pasta do catálogo"
                            onClick={() => setRemove(path)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={FolderOpen}
                      title="O cinema começa nas suas pastas"
                      description="Adicione uma pasta de filmes, séries ou animes para montar sua biblioteca."
                      action={
                        <button
                          className="button"
                          onClick={() => void addFolder()}
                        >
                          <FolderPlus size={17} />
                          Escolher pasta
                        </button>
                      }
                    />
                  )}
                  <div className="info-panel">
                    <HardDrive size={21} />
                    <p>
                      Adicionar uma pasta cria referências aos seus vídeos. O
                      Lume não move, renomeia ou apaga seus arquivos. Use
                      “Atualizar biblioteca” após adicionar novos episódios às
                      pastas.
                    </p>
                  </div>
                </>
              )}
              {view === "settings" && (
                <div className="settings-stack">
                  {!demo && desktop && runtime && (
                    <Maintenance runtime={runtime} />
                  )}
                  {!demo && desktop && (
                    <section className="settings-card">
                      <div className="section-heading">
                        <div>
                          <h2>Configuração inicial</h2>
                          <p>
                            {runtime?.portable
                              ? "Modo portátil · dados na pasta data do aplicativo"
                              : "Catálogo e histórico na sua conta do Windows"}
                          </p>
                        </div>
                        <button
                          className="button secondary small"
                          onClick={async () => {
                            try {
                              setRuntime(
                                await invoke<RuntimeInfo>("app_status"),
                              );
                              setShowOnboarding(true);
                            } catch (e) {
                              notify(String(e), true);
                            }
                          }}
                        >
                          Abrir assistente <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                  )}
                  <section className="settings-card">
                    <div className="settings-card-title">
                      <span className="folder-symbol">
                        <Play size={24} />
                      </span>
                      <div>
                        <h2>Motor de reprodução</h2>
                        <p>
                          mpv · reprodução nativa com aceleração por hardware
                          quando disponível
                        </p>
                      </div>
                    </div>
                    <div className={`player-status ${mpv ? "connected" : ""}`}>
                      {mpv ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <AlertCircle size={18} />
                      )}
                      <div>
                        <strong>
                          {mpv
                            ? "Player pronto para sua sessão"
                            : "Configure o mpv para reproduzir"}
                        </strong>
                        <p>
                          {mpv ??
                            "Selecione uma cópia portátil do mpv.exe. Não é necessário definir um player padrão no Windows."}
                        </p>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={() => void configureMpv()}
                      >
                        {mpv ? "Alterar" : "Selecionar mpv.exe"}
                      </button>
                    </div>
                  </section>
                  <section className="settings-card">
                    <h2>Sua biblioteca, no seu computador</h2>
                    <p>
                      O catálogo e o histórico são guardados em SQLite na pasta
                      de dados do Lume. A reprodução e a organização funcionam
                      offline.
                    </p>
                    <div className="settings-facts">
                      <div>
                        <span>Retomar reprodução</span>
                        <strong>
                          Posição salva a cada 5 segundos e ao pausar
                        </strong>
                      </div>
                      <div>
                        <span>Identificação</span>
                        <strong>Nome do arquivo + estrutura das pastas</strong>
                      </div>
                      <div>
                        <span>Legendas</span>
                        <strong>
                          Internas, arquivo com mesmo nome ou seleção manual
                        </strong>
                      </div>
                      <div>
                        <span>Conclusão do episódio</span>
                        <strong>Ao chegar ao fim, ou marcar manualmente</strong>
                      </div>
                    </div>
                  </section>
                  <section className="settings-card about-card">
                    <span className="brand-inline">
                      <Flame size={24} />
                      lume.
                    </span>
                    <p>
                      Um espaço para as suas histórias.
                      <br />
                      <span>
                        Versão {runtime?.version ?? "0.1.7"} · Windows ·
                        Biblioteca local
                      </span>
                    </p>
                    {!demo && (
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setLibrary(demoLibrary);
                          setDemo(true);
                          navigate("home");
                        }}
                      >
                        Explorar demonstração <ArrowUpRight size={14} />
                      </button>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="status-dot" />{" "}
              {busy
                ? "Lendo seus arquivos…"
                : "Tudo acontece no seu computador"}
            </span>
            <span>Feito para apertar o play.</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.text}</span>
          <button
            className="icon-btn"
            title="Dispensar mensagem"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {detail && (
        <Modal title="Na sua biblioteca" onClose={() => setDetail(null)}>
          <div className="detail-hero">
            <Artwork title={detail.title} wide />
            <div className="detail-hero-shade" />
            <div>
              <span className="eyebrow">
                {kindLabel[detail.kind]} · ARQUIVO LOCAL
              </span>
              <h2>{detail.title}</h2>
              <p>
                {detail.kind === "movie"
                  ? "Uma boa história espera por você."
                  : `${detail.items.length} episódios na sua biblioteca`}
              </p>
              <button
                className="button"
                onClick={() => play(nextToWatch(detail))}
              >
                <Play size={16} fill="currentColor" />
                {nextToWatch(detail).position > 0 &&
                !nextToWatch(detail).watched
                  ? "Continuar assistindo"
                  : "Assistir agora"}
              </button>
            </div>
          </div>
          <div className="detail-body">
            <div className="section-heading">
              <h3>{detail.kind === "movie" ? "Seu arquivo" : "Episódios"}</h3>
              {detail.kind !== "movie" && (
                <select
                  aria-label="Filtrar temporada"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                >
                  <option value="all">Todas as temporadas</option>
                  {[...new Set(detail.items.map((m) => m.season))].map((s) => (
                    <option value={String(s)} key={String(s)}>
                      {s === null
                        ? "Numeração contínua"
                        : s === 0
                          ? "Especiais"
                          : `Temporada ${s}`}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="icon-btn"
                title="Editar identificação da coleção"
                onClick={() => editItems(detail.items)}
              >
                <Pencil size={17} />
              </button>
              <button
                className="icon-btn"
                title="Remover coleção do catálogo"
                onClick={() => {
                  setRemoveMedia(detail.items);
                  setDetail(null);
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="episode-list">
              {detail.items
                .filter((m) => season === "all" || String(m.season) === season)
                .map((m) => (
                  <div
                    className={`episode-row ${m.missing ? "missing" : ""}`}
                    key={m.id}
                  >
                    <button
                      className="episode-play"
                      title={`Reproduzir ${m.title} · ${episodeLabel(m)}`}
                      aria-disabled={m.missing}
                      onClick={() => play(m)}
                    >
                      {m.watched ? (
                        <Check size={18} />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )}
                    </button>
                    <div className="episode-copy">
                      <strong>{episodeLabel(m)}</strong>
                      <span title={m.filename}>{m.title}</span>
                      {m.position > 0 && !m.watched && (
                        <small>Continuar em {time(m.position)}</small>
                      )}
                      {m.missing && (
                        <small className="error-inline" title={m.path}>
                          Arquivo não encontrado ·{" "}
                          {m.path.replace(/^\\\\\?\\/, "")}
                        </small>
                      )}
                    </div>
                    {m.duration > 0 && (
                      <span className="episode-duration">
                        {Math.round(m.duration / 60)} min
                      </span>
                    )}
                    <button
                      className={`icon-btn ${m.watched ? "accent" : ""}`}
                      title={
                        m.watched
                          ? "Marcar como não assistido"
                          : "Marcar como assistido"
                      }
                      onClick={() => void mark(m)}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Começar do início"
                      disabled={m.missing}
                      onClick={() => play(m, true)}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Corrigir identificação"
                      onClick={() => editItems([m])}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Remover arquivo do catálogo"
                      onClick={() => {
                        setRemoveMedia([m]);
                        setDetail(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
      {edit && (
        <EditModal
          items={edit}
          onClose={() => setEdit(null)}
          onSave={async (items) => {
            await invoke("media_edit", { items });
            setEdit(null);
            setSelected(new Set());
            await reload();
            notify("Identificação salva. Suas correções serão preservadas.");
          }}
        />
      )}
      {removeMedia && (
        <Modal
          title="Remover do catálogo?"
          onClose={() => setRemoveMedia(null)}
        >
          <div className="modal-body">
            <p>
              Remover{" "}
              {removeMedia.length === 1
                ? removeMedia[0].filename
                : `${removeMedia.length} arquivos`}{" "}
              e seu histórico do catálogo? Os vídeos e legendas continuam no
              disco.
            </p>
            <p>
              Para recuperar os itens removidos, adicione a pasta novamente.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setRemoveMedia(null)}
              >
                Cancelar
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  if (demo) {
                    setRemoveMedia(null);
                    notify("Esta é uma biblioteca de demonstração.");
                    return;
                  }
                  try {
                    await invoke("media_remove", {
                      ids: removeMedia.map((m) => m.id),
                    });
                    setRemoveMedia(null);
                    setSelected(new Set());
                    await reload();
                    notify("Itens e histórico removidos do catálogo.");
                  } catch (e) {
                    setRemoveMedia(null);
                    notify(String(e), true);
                  }
                }}
              >
                Remover do catálogo
              </button>
            </div>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Remover pasta da biblioteca?"
          onClose={() => setRemove(null)}
        >
          <div className="modal-body">
            <p>
              O catálogo e o histórico dos arquivos desta pasta serão removidos.
              Os vídeos e legendas continuam no disco.
            </p>
            <code className="path-block">{remove}</code>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setRemove(null)}
              >
                Cancelar
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  if (demo) {
                    notify("Esta é uma biblioteca de demonstração.");
                    setRemove(null);
                    return;
                  }
                  try {
                    await invoke("folder_remove", { path: remove });
                    setRemove(null);
                    await reload();
                    notify("Pasta removida do catálogo.");
                  } catch (e) {
                    notify(String(e), true);
                  }
                }}
              >
                Remover do catálogo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={29} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
interface EditValue {
  id: number;
  title: string;
  kind: Kind;
  season: number | null;
  episode: number | null;
}
function EditModal({
  items,
  onClose,
  onSave,
}: {
  items: Media[];
  onClose: () => void;
  onSave: (items: EditValue[]) => Promise<void>;
}) {
  const [title, setTitle] = useState(items[0].title),
    [kind, setKind] = useState<Kind>(items[0].kind),
    [season, setSeason] = useState(
      items[0].season === null ? "" : String(items[0].season),
    ),
    [episode, setEpisode] = useState(
      items[0].episode === null ? "" : String(items[0].episode),
    ),
    [sequence, setSequence] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(
        items.map((m, i) => ({
          id: m.id,
          title: title.trim(),
          kind,
          season: kind === "movie" || season === "" ? null : Number(season),
          episode:
            kind === "movie"
              ? null
              : items.length === 1
                ? episode === ""
                  ? null
                  : Number(episode)
                : sequence && episode !== ""
                  ? Number(episode) + i
                  : m.episode,
        })),
      );
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };
  return (
    <Modal
      title={
        items.length > 1
          ? `Organizar ${items.length} arquivos`
          : "Corrigir identificação"
      }
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="edit-form" onSubmit={(e) => void submit(e)}>
        <p className="form-intro">
          As alterações organizam o catálogo e não renomeiam seus arquivos.
        </p>
        <label>
          Título da obra
          <input
            autoFocus
            required
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do filme ou da série"
          />
        </label>
        <label>
          Tipo
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="movie">Filme</option>
            <option value="series">Série</option>
            <option value="anime">Anime</option>
          </select>
        </label>
        {kind !== "movie" && (
          <>
            <div className="form-columns">
              <label>
                Temporada
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="Sem temporada"
                />
                <small>0 para especiais; vazio para contínua.</small>
              </label>
              <label>
                {items.length > 1 ? "Primeiro episódio" : "Episódio"}
                <input
                  type="number"
                  min="0"
                  max="99999"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  placeholder="Não identificado"
                />
              </label>
            </div>
            {items.length > 1 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={sequence}
                  onChange={(e) => setSequence(e.target.checked)}
                />
                Numerar episódios em sequência (pela ordem dos arquivos)
              </label>
            )}
          </>
        )}
        <details className="edit-files">
          <summary>{items.length} arquivo(s) selecionado(s)</summary>
          {items.map((m) => (
            <p key={m.id}>{m.filename}</p>
          ))}
        </details>
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button" disabled={saving || !title.trim()}>
            {saving ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Salvar identificação
          </button>
        </div>
      </form>
    </Modal>
  );
}
