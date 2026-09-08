"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="error-page"><h1>Something went wrong</h1><p>We couldn’t load this page. Please try again.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
