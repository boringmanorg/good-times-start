import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy — XTSY POS" }, { name: "description", content: "What XTSY POS collects, why, who can see it and how to have it corrected or deleted." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="26 November 2026">
      <p>XTSY POS is billing software made by XTSY Ventures Private Limited ("XTSY", "we"). This page explains what we collect, why, who can see it, and what you can ask us to do with it. It covers this website, the XTSY POS apps (POS Billdesk, POS Manager and Waiter Pro) and the guest ordering and booking pages restaurants share through QR codes.</p>

      <h2>Who is responsible for what</h2>
      <p>For a restaurant's own records (its menu, bills, purchases, staff logins and its guests' details), the restaurant decides what is collected and why. XTSY stores and processes those records on the restaurant's behalf, to run the service. For the restaurant accounts we manage (owner details, subscription and payments), and for this website, XTSY is responsible.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Restaurant account:</strong> outlet name, address, the owner's name, phone and email, plan, payments and renewal dates.</li>
        <li><strong>Staff logins:</strong> each login's name, role and sign-in email, and which device it used.</li>
        <li><strong>Restaurant records:</strong> menu, tables and rooms, bills, KOTs, payments taken, purchases, vendors, expenses and the audit log of who changed what.</li>
        <li><strong>Guest details a restaurant enters or a guest gives:</strong> name, mobile number, party size, orders, delivery address and map pin, visits and loyalty points, and whether the guest agreed to receive offers on WhatsApp.</li>
        <li><strong>UPI payment screenshots</strong> a guest uploads for a prepaid QR order. They are kept privately and only that restaurant's staff can open them, through a link that expires in 10 minutes.</li>
        <li><strong>Devices:</strong> a device identifier and the name the restaurant gives each terminal, so it can approve or block devices.</li>
        <li><strong>Website enquiries:</strong> the enquiry form does not send anything to our servers. It opens WhatsApp with your message addressed to XTSY, and keeps a copy on your own device to fill the form next time.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the service: billing, printing, syncing between a restaurant's devices, reports and accounts.</li>
        <li>To manage subscriptions, support a restaurant when it asks us to, and keep the service secure (for example, blocking a lost device).</li>
        <li>To send a guest's bill or an offer on WhatsApp, only when the restaurant chooses to and, for offers, only to guests who agreed. A guest can reply STOP at any time.</li>
      </ul>
      <p>We do not sell personal data, and we do not use restaurant or guest data for advertising.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>A restaurant's records are visible only to that restaurant's own logins, by role.</li>
        <li>XTSY staff may open a restaurant's app to help it. Every such sign-in records who opened it and why, and the restaurant's audit log shows what support changed.</li>
        <li>Our hosting and database providers store the data for us under their own security terms. WhatsApp (Meta) receives a message when a restaurant sends one.</li>
        <li>We share data with authorities only when the law requires it.</li>
      </ul>

      <h2>Data kept on your devices</h2>
      <p>The apps keep a copy of the restaurant's records in the browser's storage on each device, so billing continues when the internet drops. Signing out of support, or switching a device to another outlet, clears that copy once everything has synced. We do not use advertising cookies.</p>

      <h2>How long we keep it</h2>
      <p>We keep a restaurant's records while its account is open, and for as long as the law asks businesses to keep billing and tax records after that. A restaurant can ask us to delete its account and records; a guest can ask the restaurant, or us, to delete their details.</p>

      <h2>Your choices</h2>
      <p>You can ask to see, correct or delete personal data we hold about you, or withdraw consent you gave (for example, to WhatsApp offers). Write to <a href="mailto:admin@xtsy.one">admin@xtsy.one</a>. If your request is about a restaurant's guest list, we will pass it to that restaurant and help it act on it.</p>

      <h2>Complaints</h2>
      <p>Send any complaint about how your data is handled to our grievance officer at <a href="mailto:admin@xtsy.one">admin@xtsy.one</a>. We acknowledge complaints within 7 days and aim to resolve them within 30 days.</p>

      <h2>Changes</h2>
      <p>When we change this policy we update the date at the top of this page. Significant changes are also told to restaurant owners directly.</p>
    </LegalPage>
  );
}
