export function PublicApp() {
  return <main className="public-landing" aria-labelledby="public-app-title">
    <header className="public-landing-header">
      <a className="public-brand" href="/" aria-label="Crucible home"><span className="public-brand-mark">C</span><span><strong>CRUCIBLE</strong><small>Runtime verification</small></span></a>
      <a className="public-header-link" href="https://github.com/myuzakie/Crucible" target="_blank" rel="noreferrer">GitHub</a>
    </header>
    <section className="public-hero">
      <div>
        <p className="eyebrow">PUBLIC / MONAD RUNTIME VERIFICATION</p>
        <h1 id="public-app-title">Find the runtime failure before your users do.</h1>
        <p className="public-hero-copy">Crucible runs real dApp journeys, captures runtime evidence, and helps you verify the fix on Monad.</p>
        <div className="public-hero-actions">
          <a className="primary-button" href="/demo">Try interactive demo</a>
          <a className="secondary-button" href="#install">Install / quick start</a>
        </div>
      </div>
      <aside className="public-hero-card" aria-label="Crucible product flow">
        <p className="eyebrow">THE CRUCIBLE LOOP</p>
        <strong>Journey → Failure → Evidence → Replay</strong>
        <span>Turn a failing runtime check into a verified result and Runtime Passport.</span>
      </aside>
    </section>
    <section className="public-story" aria-labelledby="public-story-title">
      <p className="eyebrow">WHY CRUCIBLE</p>
      <h2 id="public-story-title">Runtime behavior is part of the product contract.</h2>
      <div className="public-story-grid">
        <article><strong>Journey</strong><p>Describe the user flow that matters, not just an isolated function call.</p></article>
        <article><strong>Evidence</strong><p>Inspect the failed step, observed values, and the Monad rule behind it.</p></article>
        <article><strong>Replay</strong><p>Run the same journey again and keep the proof that the fix recovered it.</p></article>
      </div>
    </section>
    <section className="public-install" id="install" aria-labelledby="public-install-title">
      <div>
        <p className="eyebrow">LOCAL DEVELOPER WORKSPACE</p>
        <h2 id="public-install-title">Connect your repository locally.</h2>
        <p>Install the CLI, then let <code>connect</code> start the real workspace on your machine. The hosted public demo never connects to a repository or localhost.</p>
      </div>
      <div className="public-command"><code>pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .</code><a className="secondary-button" href="https://github.com/myuzakie/Crucible/blob/main/docs/CRUCIBLE_RUNTIME_GUIDE.md" target="_blank" rel="noreferrer">Read the guide</a></div>
    </section>
    <footer className="public-footer"><span>CRUCIBLE · Public deterministic demo</span><a href="https://github.com/myuzakie/Crucible" target="_blank" rel="noreferrer">Source and docs</a></footer>
  </main>;
}
