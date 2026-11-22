/** Plan / itinerary (P1–P4). Proposal from Instinct, freely reordered. */
export type PlanItem = { id: string; title: string; done: boolean };
export const SAMPLE_PLAN: PlanItem[] = [
  { id: 'a', title: 'Cold open and catch-up', done: false },
  { id: 'b', title: 'Lead story: [TOPIC]', done: false },
  { id: 'c', title: 'Game: Imposter', done: false },
  { id: 'd', title: 'Debate block', done: false },
  { id: 'e', title: 'Wrap and shout-outs', done: false },
];
export const nextAfter = (list: PlanItem[], nowId: string | null) => {
  const i = list.findIndex((x) => x.id === nowId);
  return list.find((x, k) => k > i && !x.done) ?? list.find((x) => !x.done && x.id !== nowId) ?? null;
};
