import pLimit from "p-limit";
import { fd } from "./client.js";
import { upsertTicketBatch, type TicketFD } from "./upsert.js";

type SearchRes = {
  total: number;
  results: Array<{ id: number; updated_at: string }>;
};

// Trae cerrados (status 5) actualizados desde sinceISO y guarda en DB
export async function syncClosedTickets(sinceISO: string) {
  const query = `status:5 AND updated_at:>'${sinceISO}'`; // 5 = Closed
  let page = 1;
  const per_page = 30;
  let imported = 0;

  for (;;) {
    const { data } = await fd.get<SearchRes>("/search/tickets", {
      // OJO: Freshdesk requiere el query ENTRE COMILLAS
      params: { query: `"${query}"`, page },
    });

    const ids = data?.results ?? [];
    if (!ids.length) break;

    const limit = pLimit(10); // controla concurrencia (respeta rate limits)
    const enriched: TicketFD[] = await Promise.all(
      ids.map((r) =>
        limit(async () => {
          const { data } = await fd.get(`/tickets/${r.id}`, {
            params: { include: "requester,company,stats" },
          });
          return data;
        })
      )
    );

    await upsertTicketBatch(enriched);
    imported += enriched.length;

    if (page * per_page >= (data.total || 0)) break;
    page += 1;
  }
  return imported;
}
