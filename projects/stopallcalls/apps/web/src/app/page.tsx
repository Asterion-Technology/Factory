import Link from 'next/link';

// INT-001 landing content. Copy placeholders below require counsel approval
// before production (see docs/BUILD_PLAN.md open decisions).
export default function LandingPage() {
  return (
    <main>
      <h1>Stop Collection Calls</h1>
      <p>
        Are debt collectors calling, texting, emailing, or mailing you? We prepare and send a
        lawyer-issued cease-and-desist communication letter to the collection agency.
      </p>
      <Link className="cta" href="/intake">
        Start Intake
      </Link>
      <div className="disclaimer">
        <p>
          [PLACEHOLDER — jurisdiction-specific legal disclaimer, pending counsel approval.] This
          is a limited-scope legal service. It does not include litigation, court proceedings,
          credit repair, debt settlement, or defending a lawsuit unless separately retained.
        </p>
        <p>
          [PLACEHOLDER — privacy notice link · accessibility statement · licensing information]
        </p>
      </div>
    </main>
  );
}
