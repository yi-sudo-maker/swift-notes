"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Block = {
  id: string;
  type: "text" | "heading" | "todo";
  text: string;
  checked?: boolean;
};

type Page = {
  id: string;
  title: string;
  blocks: Block[];
  updatedAt: number;
  notionUrl?: string;
};

type NotionPage = {
  id: string;
  title: string;
  url: string;
  editedAt: string | null;
};

type SendKind = "タスク" | "メモ" | "アイデア";

const STORAGE_KEY = "swift-notes.pages";
const NOTION_SESSION_KEY = "swift-notes.notion-token";
const NOTION_DATA_SOURCE_SESSION_KEY = "swift-notes.notion-data-source-id";
const NOTION_TITLE_SESSION_KEY = "swift-notes.notion-title-property";
const STARTER_UPDATED_AT = new Date("2026-07-26T12:00:00+09:00").getTime();

const now = () => Date.now();

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createPage = (title = ""): Page => ({
  id: createId(),
  title,
  blocks: [],
  updatedAt: now(),
});

const starterPages: Page[] = [
  {
    id: "draft",
    title: "",
    updatedAt: STARTER_UPDATED_AT,
    blocks: [],
  },
];

function getInitialState() {
  return {
    pages: starterPages,
    activePageId: starterPages[0].id,
  };
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(timestamp);
}

export default function Home() {
  const [initialState] = useState(getInitialState);
  const [pages, setPages] = useState<Page[]>(initialState.pages);
  const [activePageId, setActivePageId] = useState(initialState.activePageId);
  const [saveState, setSaveState] = useState("保存済み");
  const [storageReady, setStorageReady] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDataSourceId, setNotionDataSourceId] = useState("");
  const [notionTitleProperty, setNotionTitleProperty] = useState("Name");
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [notionStatus, setNotionStatus] = useState("未接続");
  const [isNotionLoading, setIsNotionLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedPages = localStorage.getItem(STORAGE_KEY);
      const storedNotionToken = sessionStorage.getItem(NOTION_SESSION_KEY);
      const storedDataSourceId = sessionStorage.getItem(
        NOTION_DATA_SOURCE_SESSION_KEY,
      );
      const storedTitleProperty = sessionStorage.getItem(
        NOTION_TITLE_SESSION_KEY,
      );

      if (storedPages) {
        try {
          const parsed = JSON.parse(storedPages) as Page[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((page) => ({
              ...page,
              blocks: Array.isArray(page.blocks) ? page.blocks : [],
            }));
            const hasDraft = normalized.some((page) => !page.notionUrl);
            const nextPages = hasDraft ? normalized : [createPage(), ...normalized];
            setPages(nextPages);
            setActivePageId(nextPages[0].id);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      if (storedNotionToken) {
        setNotionToken(storedNotionToken);
        setNotionStatus("セッション接続中");
      }
      if (storedDataSourceId) setNotionDataSourceId(storedDataSourceId);
      if (storedTitleProperty) setNotionTitleProperty(storedTitleProperty);

      setStorageReady(true);
      window.setTimeout(() => titleRef.current?.focus(), 0);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA登録に失敗しても、送信機能自体はそのまま使える。
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    const timer = window.setTimeout(() => setSaveState("保存済み"), 380);

    return () => window.clearTimeout(timer);
  }, [pages, storageReady]);

  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];

  const visiblePages = useMemo(
    () => pages.filter((page) => page.title.trim() || page.notionUrl),
    [pages],
  );

  const isConnected = Boolean(notionToken.trim() && notionDataSourceId.trim());

  function updateActiveTitle(title: string) {
    setSaveState("保存中...");
    setPages((current) =>
      current.map((page) =>
        page.id === activePage.id ? { ...page, title, updatedAt: now() } : page,
      ),
    );
  }

  async function connectNotionDataSource() {
    const token = notionToken.trim();
    const dataSourceId = notionDataSourceId.trim();
    if (!token) {
      setNotionStatus("トークンを入力してください");
      return;
    }
    if (!dataSourceId) {
      setNotionStatus("データベースURLまたはIDを入力してください");
      return;
    }

    setIsNotionLoading(true);
    setNotionStatus("接続確認中...");

    try {
      const response = await fetch("/api/notion/data-source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataSourceId }),
      });

      const payload = (await response.json()) as {
        dataSourceId?: string;
        titleProperty?: string;
        pages?: NotionPage[];
        error?: string;
      };

      if (!response.ok || !payload.pages) {
        throw new Error(payload.error ?? "Notionに接続できませんでした");
      }

      const nextDataSourceId = payload.dataSourceId ?? dataSourceId;
      const nextTitleProperty =
        payload.titleProperty ?? (notionTitleProperty.trim() || "Name");

      sessionStorage.setItem(NOTION_SESSION_KEY, token);
      sessionStorage.setItem(NOTION_DATA_SOURCE_SESSION_KEY, nextDataSourceId);
      sessionStorage.setItem(NOTION_TITLE_SESSION_KEY, nextTitleProperty);
      setNotionDataSourceId(nextDataSourceId);
      setNotionTitleProperty(nextTitleProperty);
      setNotionPages(payload.pages);
      setNotionStatus(`接続済み: ${payload.pages.length}件表示`);
    } catch (error) {
      setNotionStatus(
        error instanceof Error ? error.message : "Notionに接続できませんでした",
      );
    } finally {
      setIsNotionLoading(false);
    }
  }

  function disconnectNotion() {
    sessionStorage.removeItem(NOTION_SESSION_KEY);
    sessionStorage.removeItem(NOTION_DATA_SOURCE_SESSION_KEY);
    sessionStorage.removeItem(NOTION_TITLE_SESSION_KEY);
    setNotionToken("");
    setNotionDataSourceId("");
    setNotionTitleProperty("Name");
    setNotionPages([]);
    setNotionStatus("未接続");
  }

  async function sendCurrentPageToNotion(kind: SendKind = "タスク") {
    const title = activePage.title.trim();
    const token = notionToken.trim();
    const dataSourceId = notionDataSourceId.trim();
    const titleProperty = notionTitleProperty.trim() || "Name";

    if (!title) {
      setNotionStatus("タイトルを入力してください");
      titleRef.current?.focus();
      return;
    }
    if (!token || !dataSourceId) {
      setNotionStatus("設定画面でNotion接続を完了してください");
      setIsSettingsOpen(true);
      return;
    }

    setIsNotionLoading(true);
    setNotionStatus("送信中...");

    try {
      const response = await fetch("/api/notion/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dataSourceId,
          titleProperty,
          page: {
            ...activePage,
            title,
            category: kind === "タスク" ? kind : undefined,
            memo: kind === "メモ",
            idea: kind === "アイデア",
            progress: kind === "アイデア" ? "未着手" : undefined,
            blocks: [],
          },
        }),
      });

      const payload = (await response.json()) as {
        dataSourceId?: string;
        titleProperty?: string;
        page?: NotionPage;
        error?: string;
      };

      if (!response.ok || !payload.page) {
        throw new Error(payload.error ?? "Notionへ送信できませんでした");
      }

      const nextDataSourceId = payload.dataSourceId ?? dataSourceId;
      const nextTitleProperty = payload.titleProperty ?? titleProperty;
      sessionStorage.setItem(NOTION_SESSION_KEY, token);
      sessionStorage.setItem(NOTION_DATA_SOURCE_SESSION_KEY, nextDataSourceId);
      sessionStorage.setItem(NOTION_TITLE_SESSION_KEY, nextTitleProperty);
      setNotionDataSourceId(nextDataSourceId);
      setNotionTitleProperty(nextTitleProperty);
      const draft = createPage();
      setPages((current) => {
        const sentPages = current.map((page) =>
          page.id === activePage.id
            ? {
                ...page,
                title,
                notionUrl: payload.page?.url,
                updatedAt: now(),
              }
            : page,
        );
        return [draft, ...sentPages];
      });
      setActivePageId(draft.id);
      setNotionPages((current) => [payload.page, ...current].slice(0, 10));
      setNotionStatus(`${kind}として送信しました`);
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (error) {
      setNotionStatus(
        error instanceof Error ? error.message : "Notionへ送信できませんでした",
      );
    } finally {
      setIsNotionLoading(false);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      void sendCurrentPageToNotion("タスク");
    }
  }

  const sendButtons: Array<{ kind: SendKind; icon: string }> = [
    { kind: "タスク", icon: "✓" },
    { kind: "メモ", icon: "✎" },
    { kind: "アイデア", icon: "✦" },
  ];

  return (
    <main className="appShell">
      <aside className="sidebar" aria-label="Pages">
        <div className="brandRow">
          <div>
            <p className="eyebrow">クイック送信</p>
            <h1>Swift Notes</h1>
          </div>
          <button
            className="settingsIconButton"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Notion設定"
            title="Notion設定"
          >
            ⚙
            <span className={isConnected ? "connectionDot connected" : "connectionDot"} />
          </button>
        </div>

        <nav className="pageList" aria-label="送信履歴">
          {visiblePages.map((page) => (
            <button
              className={`pageItem ${page.id === activePage.id ? "active" : ""}`}
              key={page.id}
              type="button"
              onClick={() => setActivePageId(page.id)}
            >
              <span className="pageTitle">{page.title || "無題"}</span>
              <span className="pageMeta">
                {page.notionUrl ? "送信済み" : "下書き"} ・ {formatDate(page.updatedAt)}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="editorPane" aria-label="Editor">
        <header className="topBar">
          <span>{saveState}</span>
          <span className="notionMiniStatus">{notionStatus}</span>
        </header>

        <article className="quickEditor">
          <label className="memoField">
            <span>メモ入力</span>
            <textarea
              ref={titleRef}
              className="quickTitleInput"
              value={activePage.title}
              onChange={(event) => updateActiveTitle(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="投稿したいメモを入力してください"
              aria-label="メモ入力"
              rows={4}
            />
          </label>
          <div className="quickActions">
            {sendButtons.map((button) => (
              <button
                className="sendKindButton"
                key={button.kind}
                type="button"
                onClick={() => sendCurrentPageToNotion(button.kind)}
                disabled={isNotionLoading || !activePage.title.trim()}
              >
                <span aria-hidden="true">{button.icon}</span>
                {button.kind}
              </button>
            ))}
          </div>
        </article>
      </section>

      {isSettingsOpen && (
        <div className="modalBackdrop" role="presentation">
          <section
            className="settingsModal"
            role="dialog"
            aria-modal="true"
            aria-label="Notion設定"
          >
            <div className="settingsHeader">
              <div>
                <p className="eyebrow">設定</p>
                <h2>Notion送信先</h2>
              </div>
              <button
                className="iconButton"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="設定を閉じる"
              >
                ×
              </button>
            </div>

            <div className="settingsFields">
              <label>
                <span>Notionトークン</span>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(event) => setNotionToken(event.target.value)}
                  placeholder="secret_..."
                  autoComplete="off"
                />
              </label>
              <label>
                <span>データベースURLまたはID</span>
                <input
                  value={notionDataSourceId}
                  onChange={(event) => setNotionDataSourceId(event.target.value)}
                  placeholder="InboxのURLを丸ごと"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>タイトル列名</span>
                <input
                  value={notionTitleProperty}
                  onChange={(event) => setNotionTitleProperty(event.target.value)}
                  placeholder="タスク名"
                />
              </label>
            </div>

            <div className="settingsActions">
              <button
                className="secondaryButton"
                type="button"
                onClick={disconnectNotion}
              >
                切断
              </button>
              <button
                className="sendNotionButton"
                type="button"
                onClick={connectNotionDataSource}
                disabled={isNotionLoading}
              >
                {isNotionLoading ? "確認中..." : "接続を確認"}
              </button>
            </div>

            <p className="notionStatus">{notionStatus}</p>

            {notionPages.length > 0 && (
              <div className="notionResults">
                {notionPages.map((page) => (
                  <a
                    key={page.id}
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{page.title}</span>
                    <small>開く</small>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
