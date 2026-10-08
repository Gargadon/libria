/** Public API proposal. The plugin loader/runtime is not implemented yet. */
export type ApiVersion = 1;
export type Permission =
  | 'document.read'
  | 'document.propose-edits'
  | 'network'
  | 'browser.open'
  | 'authorization.oauth'
  | 'secrets';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: ApiVersion;
  main: string;
  description?: string;
  author?: string;
  permissions: Permission[];
  networkOrigins?: string[];
}

export interface Disposable { dispose(): void; }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A detached projection for analysis; never a mutable document/store reference. */
export interface DocumentSnapshot {
  readonly sessionId: string;
  readonly revision: string;
  readonly title: string;
  readonly chapters: readonly {
    readonly id: string;
    readonly title: string;
    readonly paragraphs: readonly { readonly blockIndex: number; readonly text: string }[];
  }[];
}

export interface TextSelection {
  readonly sessionId: string;
  readonly revision: string;
  readonly chapterId: string;
  readonly text: string;
}

/** Closed operations: no JSON patches, arbitrary keys, HTML or plugin block types. */
export type NativeTextEdit =
  | { type: 'replace-paragraph-text'; chapterId: string; blockIndex: number; text: string }
  | { type: 'insert-paragraphs'; chapterId: string; beforeBlockIndex: number; paragraphs: string[] };

export interface EditProposal {
  sessionId: string;
  revision: string;
  title: string;
  edits: NativeTextEdit[];
}

export type EditOutcome = 'applied' | 'cancelled' | 'conflict';

export interface DocumentsApi {
  /** Requires document.read. */
  getSnapshot(): Promise<DocumentSnapshot | null>;
  /** Requires document.read. */
  getSelection(): Promise<TextSelection | null>;
  /** Requires document.propose-edits. The host validates and asks the user first. */
  proposeEdits(proposal: EditProposal): Promise<EditOutcome>;
}

export interface Command {
  /** Local ID, namespaced by the host with the manifest ID. */
  id: string;
  title: string;
  requiresDocument?: boolean;
  run(signal: AbortSignal): Promise<void>;
}

export interface Account { label: string; email?: string; }
export interface RemoteFile {
  id: string;
  name: string;
  modifiedAt?: string;
  sizeBytes?: number;
  downloadable?: boolean;
}
export interface FilePage { files: RemoteFile[]; cursor?: string; }

/** Transport only. Providers cannot deserialize or rewrite the editor's document. */
export interface StorageProvider {
  id: string;
  name: string;
  /** Omit for providers that do not require a connected account. */
  account?: {
    get(): Promise<Account | null>;
    connect(signal: AbortSignal): Promise<Account>;
    disconnect(signal: AbortSignal): Promise<void>;
  };
  listFiles(request: { cursor?: string; signal: AbortSignal }): Promise<FilePage>;
  /** Returns UTF-8 JSON. The host validates it before opening anything. */
  readFile(request: { id: string; signal: AbortSignal }): Promise<string>;
}

/** Declarative UI only: no Angular components, raw HTML, scripts or DOM access. */
export type PanelItem =
  | { type: 'text'; text: string }
  | { type: 'button'; label: string; commandId: string };
export interface Panel { id: string; title: string; items: readonly PanelItem[]; }

export interface ContributionsApi {
  registerCommand(command: Command): Disposable;
  registerStorageProvider(provider: StorageProvider): Disposable;
  registerPanel(panel: Panel): Disposable;
}

export interface NetworkApi {
  /** Requires network; only manifest origins, including all redirect destinations. */
  request(request: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; headers: Readonly<Record<string, string>>; body: string }>;
}

export interface OAuthCodeRequest {
  authorizationEndpoint: string;
  clientId: string;
  scopes: string[];
  parameters?: Record<string, string>;
}

export interface PluginContext {
  readonly manifest: Readonly<PluginManifest>;
  readonly host: { readonly version: string; readonly apiVersion: ApiVersion };
  readonly lifetime: AbortSignal;
  readonly contributions: ContributionsApi;
  readonly documents: DocumentsApi;
  readonly network: NetworkApi;
  readonly browser: {
    /** Requires browser.open. The host opens an approved HTTPS URL in the system browser. */
    open(url: string): Promise<void>;
  };
  readonly authorization: {
    /** Requires authorization.oauth. Host manages local callback, state and S256 PKCE. */
    requestCode(request: OAuthCodeRequest, signal: AbortSignal): Promise<{
      code: string;
      redirectUri: string;
      codeVerifier: string;
    }>;
  };
  /** Plugin-local preferences, outside .libria. Never store passwords or tokens here. */
  readonly settings: {
    get(key: string): Promise<JsonValue | undefined>;
    set(key: string, value: JsonValue): Promise<void>;
    delete(key: string): Promise<void>;
  };
  /** Requires secrets. Host-controlled encrypted storage scoped to this plugin. */
  readonly secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly ui: {
    notify(message: string, severity?: 'info' | 'warning' | 'error'): void;
    prompt(request: { title: string; label: string; initialValue?: string }): Promise<string | null>;
  };
  readonly events: {
    /** Notifications contain no book content. Read access still requires document.read. */
    subscribe(event: 'document.opened' | 'document.changed' | 'document.closed',
      listener: (data: { sessionId: string; revision?: string }) => void): Disposable;
  };
}

export interface LibriaPlugin {
  activate(context: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;
}
