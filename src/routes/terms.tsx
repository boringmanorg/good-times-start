import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service — XTSY POS" }, { name: "description", content: "The terms on which XTSY Ventures Private Limited provides XTSY POS to restaurants." }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of service" updated="26 November 2026">
      <p>These terms are an agreement between XTSY Ventures Private Limited ("XTSY", "we") and the business that subscribes to XTSY POS ("the restaurant", "you"). Using XTSY POS means you accept them.</p>

      <h2>The service</h2>
      <p>XTSY POS is software for billing, kitchen tickets, guest ordering, purchases, accounts and reports. What each plan includes is listed on our <Link to="/" hash="pricing">pricing</Link>. Features marked as being tested or coming next are not part of any plan until they are live.</p>

      <h2>Accounts and logins</h2>
      <ul>
        <li>XTSY sets up each outlet and its logins. Keep passwords private; you are responsible for what is done with your logins.</li>
        <li>Each new device must be approved by the restaurant's owner or manager. Tell us at once if a device is lost, so it can be blocked.</li>
        <li>With your request or agreement, XTSY support may sign in to your app to help. Each such sign-in is recorded with its reason.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>The details on your bills (GSTIN, tax rates, prices, FSSAI number) are yours to set correctly. XTSY POS calculates from what you enter; it is not tax or legal advice.</li>
        <li>Message guests on WhatsApp only with their agreement, and honour a guest's request to stop.</li>
        <li>Collect guests' personal details only for running your restaurant, and handle them as the law requires.</li>
        <li>Don't use XTSY POS for anything unlawful, or try to reach another restaurant's data.</li>
      </ul>

      <h2>Plans and payment</h2>
      <p>Plans are priced per outlet per month and paid in advance for the period you choose. Payments are made to XTSY directly; this website takes no payment. If a plan is not renewed, the outlet keeps working for 7 days after its paid-until date and then stops until it is renewed. Your records stay on your devices and in your account, and sync again when the plan is renewed. Refunds follow our <Link to="/refunds">refund and cancellation policy</Link>.</p>

      <h2>Guest payments</h2>
      <p>Guests pay the restaurant directly (cash, card, or UPI into the restaurant's own UPI ID). XTSY does not receive, hold or refund guests' money. Questions about a guest's payment are between the guest and the restaurant.</p>

      <h2>Availability</h2>
      <p>We work to keep XTSY POS available and to fix problems quickly. Billing works without internet on the counter; syncing, guest QR ordering and reports need a connection. We may pause the service briefly for maintenance, and will tell you in advance when we can.</p>

      <h2>Your data</h2>
      <p>Your restaurant's records belong to you. You can export your reports to Excel at any time. How we handle personal data is set out in our <Link to="/privacy">privacy policy</Link>.</p>

      <h2>Our software</h2>
      <p>XTSY, XTSY POS and POS by XTSY, and the software itself, belong to XTSY. Your subscription lets you use the software for your outlets; it doesn't let you copy, resell or modify it.</p>

      <h2>Liability</h2>
      <p>XTSY is not liable for indirect losses, such as lost profit, arising from use of the service. Our total liability for any claim is limited to the fees you paid for the affected outlet in the three months before the claim.</p>

      <h2>Ending the service</h2>
      <p>You can stop at any time by telling us; the plan stays live until its paid-until date. We may suspend an outlet that breaks these terms or doesn't pay, after telling you.</p>

      <h2>Law and disputes</h2>
      <p>These terms are governed by the laws of India. Disputes are subject to the courts at Coimbatore, Tamil Nadu. Write to <a href="mailto:admin@xtsy.one">admin@xtsy.one</a> first; most things are settled faster that way.</p>
    </LegalPage>
  );
}
