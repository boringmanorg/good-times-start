import { createFileRoute } from "@tanstack/react-router";
import { ModelPage } from "@/components/site/ModelPage";
import { loadCatalogue, plansByModelFrom, plansForModel } from "@/lib/public-plans";
import { modelHead } from "@/lib/site-head";
import { modelById } from "@/lib/site-models";

const model = modelById("tourism_pos");

export const Route = createFileRoute("/tourism-pos")({
  loader: async () => ({ rows: await loadCatalogue() }),
  head: ({ loaderData }) => modelHead(model, plansForModel(loaderData?.rows ?? [], model.id)),
  component: Page,
});

function Page() {
  const { rows } = Route.useLoaderData();
  return <ModelPage model={model} plansByModel={plansByModelFrom(rows)} />;
}
