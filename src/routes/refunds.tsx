import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";
import { APP_ORIGIN } from "@/lib/site-config";

export const Route = createFileRoute("/refunds")({
  head: () => ({ links: [{ rel: "canonical", href: `${APP_ORIGIN}/refunds` }], meta: [{ title: "Refund and cancellation policy — XTSY POS" }, { name: "description", content: "How cancelling an XTSY POS plan works, and when XTSY refunds a payment." }] }),
  component: Refunds,
});

function Refunds() {
  return (
    <LegalPage title="Refunds and cancellation" updated="26 November 2026">
      <p>This policy covers payments made to XTSY Ventures Private Limited for XTSY POS plans. Guests' payments to a restaurant are not paid to XTSY; refunds for those are the restaurant's to give.</p>

      <h2>Cancelling a plan</h2>
      <ul>
        <li>You can cancel at any time by writing to <a href="mailto:admin@xtsy.one">admin@xtsy.one</a> or telling the XTSY team on WhatsApp.</li>
        <li>Plans never renew by themselves: each renewal is a payment you choose to make.</li>
        <li>After you cancel, the outlet keeps working until the end of the period you paid for.</li>
      </ul>

      <h2>When we refund</h2>
      <ul>
        <li><strong>Paid twice by mistake:</strong> the duplicate payment is refunded in full.</li>
        <li><strong>XTSY can't provide the service:</strong> if we cannot provide the plan you paid for, we refund the unused part of the paid period, worked out by day.</li>
        <li><strong>Plan changed to a lower one mid-period:</strong> the difference is carried forward as credit against your next renewal.</li>
      </ul>
      <p>Apart from these, a period that has already started is not refunded if you cancel part way through.</p>

      <h2>How refunds are paid</h2>
      <p>Refunds go back to the account the payment came from, within 7 working days of being agreed. Write to <a href="mailto:admin@xtsy.one">admin@xtsy.one</a> with your outlet name and the payment reference.</p>
    </LegalPage>
  );
}
