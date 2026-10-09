// src/routes/msSync.ts

import {
  Router,
  type Request,
  type Response,
} from "express";

import pLimit from "p-limit";

import {
  listUsersWithLicenses,
} from "../ms/graph.js";

import {
  upsertSolicitanteFromMicrosoft,
  deactivateMissingMicrosoftSolicitantes,
} from "../service/solicitanteSyncMs.js";

import type {
  MsUserInput,
} from "../service/solicitanteSyncMs.js";

import {
  prisma,
} from "../lib/prisma.js";


export const msSyncRouter =
  Router();


/* =========================================================
   TIPOS LOCALES
========================================================= */

type MsUser = {
  id?:
  | string
  | null;

  email?:
  | string
  | null;

  name?:
  | string
  | null;

  suspended?:
  | boolean
  | null;

  licenses?: Array<{
    skuId: string;
    skuPartNumber: string;
    displayName?: string;
  }>;
};


/* =========================================================
   UTILS
========================================================= */

/**
 * MsUser[] -> MsUserInput[]
 */
function normalizeForUpsert(
  target: MsUser[]
): MsUserInput[] {
  return target.map(
    (
      u
    ): MsUserInput => {
      const nameStr =
        (
          u.name ??
          ""
        ).trim() ||
        "Usuario";

      const emailStr =
        u.email ??
        null;

      const suspended =
        !!u.suspended;

      const licenses =
        (
          u.licenses ??
          []
        ).map(
          (
            l
          ) => ({
            skuId:
              l.skuId,

            skuPartNumber:
              l.skuPartNumber,

            ...(
              l.displayName !==
                undefined
                ? {
                  displayName:
                    l.displayName,
                }
                : {}
            ),
          })
        ) as MsUserInput["licenses"];

      return {
        id:
          (
            u.id ??
            ""
          ).trim(),

        email:
          emailStr,

        name:
          nameStr,

        suspended,

        licenses,
      };
    }
  );
}


function isMicrosoftUserActivo(
  u: MsUserInput
) {
  return !(
    u.suspended ??
    false
  );
}


/**
 * Obtiene todos los dominios configurados
 * para una empresa.
 *
 * Fuente:
 * Empresa.dominios String[]
 */
async function getEmpresaMicrosoftDomains(
  empresaId: number
): Promise<string[]> {
  const empresa =
    await prisma.empresa.findUnique({
      where: {
        id_empresa:
          empresaId,
      },

      select: {
        id_empresa:
          true,

        nombre:
          true,

        dominios:
          true,

        isActive:
          true,
      },
    });

  if (!empresa) {
    throw new Error(
      "Empresa no encontrada"
    );
  }

  if (
    !empresa.isActive
  ) {
    throw new Error(
      "La empresa está inactiva"
    );
  }

  const domains =
    Array.from(
      new Set(
        (
          empresa.dominios ??
          []
        )
          .map(
            (
              domain
            ) =>
              domain
                .trim()
                .toLowerCase()
                .replace(
                  /^@/,
                  ""
                )
          )
          .filter(
            Boolean
          )
      )
    );

  if (
    domains.length ===
    0
  ) {
    throw new Error(
      `La empresa ${empresa.nombre} no tiene dominios configurados`
    );
  }

  return domains;
}


/**
 * Pre-crea catálogo de SKUs
 */
async function precreateSkus(
  msUsers: MsUserInput[]
) {
  const uniq =
    new Map<
      string,
      {
        skuId: string;
        skuPartNumber: string;
        displayName?: string;
      }
    >();

  for (
    const u
    of msUsers
  ) {
    for (
      const l
      of (
        u.licenses ??
        []
      )
    ) {
      if (
        !uniq.has(
          l.skuId
        )
      ) {
        uniq.set(
          l.skuId,
          l
        );
      }
    }
  }

  const data =
    [
      ...uniq.values(),
    ].map(
      (
        x
      ) => ({
        skuId:
          x.skuId,

        skuPartNumber:
          x.skuPartNumber,

        displayName:
          x.displayName ??
          x.skuPartNumber,
      })
    );

  if (
    data.length ===
    0
  ) {
    return {
      createdOrSkipped:
        0,
    };
  }

  await prisma.msSku.createMany({
    data,
    skipDuplicates:
      true,
  });

  return {
    createdOrSkipped:
      data.length,
  };
}


/**
 * Divide un array en chunks
 */
function chunk<T>(
  arr: T[],
  size: number
): T[][] {
  if (
    size <=
    0
  ) {
    return [
      arr,
    ];
  }

  const out:
    T[][] =
    [];

  for (
    let i = 0;
    i <
    arr.length;
    i +=
    size
  ) {
    out.push(
      arr.slice(
        i,
        i +
        size
      )
    );
  }

  return out;
}


/**
 * Upsert paralelo limitado.
 */
async function syncMsUsersBatch(
  msUsers: MsUserInput[],
  empresaId: number,
  opts?: {
    concurrency?: number;
    chunkSize?: number;
  }
) {
  let created =
    0;

  let updated =
    0;

  let skipped =
    0;


  /* ---------------------------------------------------------
     1. Catálogo SKUs
  --------------------------------------------------------- */

  const tSku0 =
    Date.now();

  const skuInfo =
    await precreateSkus(
      msUsers
    );

  const skuMs =
    Date.now() -
    tSku0;


  /* ---------------------------------------------------------
     2. Upsert paralelo
  --------------------------------------------------------- */

  const concurrency =
    Math.max(
      1,
      Math.min(
        opts?.concurrency ??
        2,
        4
      )
    );

  const limit =
    pLimit(
      concurrency
    );

  const chunkSize =
    Math.max(
      1,
      opts?.chunkSize ??
      25
    );

  const chunks =
    chunk(
      msUsers,
      chunkSize
    );

  const tDb0 =
    Date.now();

  for (
    const part
    of chunks
  ) {
    if (
      !part ||
      part.length ===
      0
    ) {
      continue;
    }

    await Promise.all(
      part.map(
        (
          u
        ) =>
          limit(
            async () => {
              if (
                !u.id
              ) {
                skipped++;
                return;
              }

              const {
                created:
                wasCreated,
              } =
                await upsertSolicitanteFromMicrosoft(
                  u,
                  empresaId
                );

              if (
                wasCreated
              ) {
                created++;
              } else {
                updated++;
              }
            }
          )
      )
    );
  }

  const dbMs =
    Date.now() -
    tDb0;

  return {
    total:
      msUsers.length,

    created,

    updated,

    skipped,

    timings: {
      skuMs,
      dbMs,

      skuCountProcessed:
        skuInfo.createdOrSkipped,

      concurrency,

      chunks:
        chunks.length,
    },
  };
}


/* =========================================================
   SELECTOR CENTRALIZADO MICROSOFT GRAPH
========================================================= */

/**
 * Consulta Microsoft para todos los dominios configurados
 * de una empresa.
 *
 * Después:
 * - une los resultados
 * - deduplica por Microsoft user id
 * - usa email como fallback
 * - opcionalmente filtra por email
 */
async function selectMsUsers(
  domains: string[],
  email?: string
) {
  const t0 =
    Date.now();

  const cleanDomains =
    Array.from(
      new Set(
        domains
          .map(
            (
              domain
            ) =>
              domain
                .trim()
                .toLowerCase()
                .replace(
                  /^@/,
                  ""
                )
          )
          .filter(
            Boolean
          )
      )
    );

  if (
    cleanDomains.length ===
    0
  ) {
    return {
      target:
        [] as MsUser[],

      allCount:
        0,

      domains:
        [] as string[],

      timings: {
        graphMs:
          Date.now() -
          t0,
      },
    };
  }

  /*
   * Se consultan todos los dominios.
   */
  const resultados =
    await Promise.all(
      cleanDomains.map(
        (
          domain
        ) =>
          listUsersWithLicenses({
            filterDomain:
              domain,
          })
      )
    );

  /*
   * Un mismo usuario podría aparecer más
   * de una vez si tiene aliases/dominos relacionados.
   *
   * Microsoft ID es la clave primaria lógica.
   * Email es fallback.
   */
  const usuariosUnicos =
    new Map<
      string,
      MsUser
    >();

  for (
    const user
    of resultados.flat()
  ) {
    const microsoftId =
      user.id
        ?.trim()
        .toLowerCase();

    const emailUsuario =
      user.email
        ?.trim()
        .toLowerCase();

    const key =
      microsoftId ||
      emailUsuario;

    if (!key) {
      continue;
    }

    usuariosUnicos.set(
      key,
      user
    );
  }

  const all =
    Array.from(
      usuariosUnicos.values()
    );

  const cleanEmail =
    email
      ?.trim()
      .toLowerCase();

  const target =
    cleanEmail
      ? all.filter(
        (
          user
        ) =>
          (
            user.email ||
            ""
          )
            .trim()
            .toLowerCase() ===
          cleanEmail
      )
      : all;

  const graphMs =
    Date.now() -
    t0;

  return {
    target,

    allCount:
      all.length,

    domains:
      cleanDomains,

    timings: {
      graphMs,
    },
  };
}


/* =========================================================
   DEBUG
========================================================= */

/**
 * GET /api/ms/debug/users?empresaId=123&limit=5
 *
 * Obtiene usuarios Microsoft utilizando TODOS
 * los dominios configurados en Empresa.dominios.
 */
msSyncRouter.get(
  "/ms/debug/users",

  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const empresaId =
        Number(
          req.query
            .empresaId
        );

      const limit =
        Number(
          req.query.limit ??
          0
        );

      if (
        !empresaId ||
        isNaN(
          empresaId
        )
      ) {
        res
          .status(400)
          .json({
            ok: false,

            error:
              "empresaId es obligatorio",
          });

        return;
      }

      const domains =
        await getEmpresaMicrosoftDomains(
          empresaId
        );

      const sel =
        await selectMsUsers(
          domains
        );

      res.json({
        ok: true,

        empresaId,

        domains:
          sel.domains,

        timings:
          sel.timings,

        total:
          sel.allCount,

        sample:
          limit >
            0
            ? sel.target.slice(
              0,
              limit
            )
            : sel.target.slice(
              0,
              5
            ),
      });
    } catch (
    e: any
    ) {
      console.error(
        "[GET /ms/debug/users] ERROR:",
        e
      );

      res
        .status(500)
        .json({
          ok: false,

          error:
            e?.message ||
            "internal",
        });
    }
  }
);


/* =========================================================
   POST — SINCRONIZACIÓN COMPLETA
========================================================= */

/**
 * POST /api/sync/microsoft/users
 *
 * body:
 * {
 *   empresaId,
 *   concurrency?,
 *   chunkSize?
 * }
 *
 * Los dominios se obtienen directamente
 * desde Empresa.dominios.
 */
msSyncRouter.post(
  "/sync/microsoft/users",

  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        empresaId,
        concurrency,
        chunkSize,
      } =
        req.body as {
          empresaId?: number;
          concurrency?: number;
          chunkSize?: number;
        };

      if (
        !empresaId ||
        isNaN(
          Number(
            empresaId
          )
        )
      ) {
        res
          .status(400)
          .json({
            ok: false,

            error:
              "empresaId requerido (number)",
          });

        return;
      }

      const empresaIdNumber =
        Number(
          empresaId
        );

      /*
       * 1. Leer TODOS los dominios configurados.
       */
      const domains =
        await getEmpresaMicrosoftDomains(
          empresaIdNumber
        );

      /*
       * 2. Consultar Graph por todos los dominios,
       *    unir y deduplicar usuarios.
       */
      const sel =
        await selectMsUsers(
          domains
        );

      const normalized =
        normalizeForUpsert(
          sel.target
        );

      /*
       * Seguridad:
       *
       * Si Microsoft devuelve 0 usuarios para todos
       * los dominios, NO desactivamos usuarios locales.
       */
      if (
        !normalized.length
      ) {
        res
          .status(502)
          .json({
            ok: false,

            error:
              "Microsoft devolvió 0 usuarios para todos los dominios configurados. Se cancela la desactivación por seguridad.",

            empresaId:
              empresaIdNumber,

            domains,
          });

        return;
      }

      /*
       * 3. Upsert.
       */
      const r =
        await syncMsUsersBatch(
          normalized,
          empresaIdNumber,
          {
            ...(
              typeof concurrency ===
                "number"
                ? {
                  concurrency,
                }
                : {}
            ),

            ...(
              typeof chunkSize ===
                "number"
                ? {
                  chunkSize,
                }
                : {}
            ),
          }
        );

      /*
       * 4. IDs Microsoft activos obtenidos
       *    desde TODOS los dominios.
       */
      const microsoftIdsActivos =
        normalized
          .filter(
            isMicrosoftUserActivo
          )
          .map(
            (
              u
            ) =>
              u.id
                ?.trim()
          )
          .filter(
            (
              id
            ): id is string =>
              Boolean(
                id
              )
          );

      /*
       * IMPORTANTE:
       *
       * La desactivación ocurre UNA SOLA VEZ,
       * después de haber unido todos los dominios.
       */
      const deactivated =
        await deactivateMissingMicrosoftSolicitantes(
          empresaIdNumber,
          microsoftIdsActivos
        );

      res.json({
        ok: true,

        empresaId:
          empresaIdNumber,

        domains:
          sel.domains,

        ...r,

        deactivated:
          deactivated.count,

        deactivatedUsers:
          deactivated.users,

        timings: {
          ...sel.timings,
          ...r.timings,
        },
      });
    } catch (
    e: any
    ) {
      console.error(
        "[POST /sync/microsoft/users] ERROR:",
        e
      );

      res
        .status(500)
        .json({
          ok: false,

          error:
            e?.message ||
            "internal",
        });
    }
  }
);


/* =========================================================
   GET — SINCRONIZACIÓN COMPLETA
========================================================= */

/**
 * GET /api/sync/microsoft/users?empresaId=123
 *
 * Mantiene compatibilidad con el endpoint GET
 * pero ya no recibe domain.
 */
msSyncRouter.get(
  "/sync/microsoft/users",

  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const empresaId =
        Number(
          req.query
            .empresaId
        );

      if (
        !empresaId ||
        isNaN(
          empresaId
        )
      ) {
        res
          .status(400)
          .json({
            ok: false,

            error:
              "empresaId requerido (number)",
          });

        return;
      }

      /*
       * 1. Obtener dominios desde Empresa.
       */
      const domains =
        await getEmpresaMicrosoftDomains(
          empresaId
        );

      /*
       * 2. Consultar todos los dominios.
       */
      const sel =
        await selectMsUsers(
          domains
        );

      const normalized =
        normalizeForUpsert(
          sel.target
        );

      if (
        !normalized.length
      ) {
        res
          .status(502)
          .json({
            ok: false,

            error:
              "Microsoft devolvió 0 usuarios para todos los dominios configurados. Se cancela la desactivación por seguridad.",

            empresaId,

            domains,
          });

        return;
      }

      /*
       * 3. Upsert.
       */
      const r =
        await syncMsUsersBatch(
          normalized,
          empresaId
        );

      /*
       * Para sincronización general usamos
       * solamente IDs Microsoft activos.
       */
      const microsoftIdsActivos =
        normalized
          .filter(
            isMicrosoftUserActivo
          )
          .map(
            (
              u
            ) =>
              u.id
                ?.trim()
          )
          .filter(
            (
              id
            ): id is string =>
              Boolean(
                id
              )
          );

      /*
       * 4. Desactivar faltantes una sola vez.
       */
      const deactivated =
        await deactivateMissingMicrosoftSolicitantes(
          empresaId,
          microsoftIdsActivos
        );

      res.json({
        ok: true,

        empresaId,

        domains:
          sel.domains,

        ...r,

        deactivated:
          deactivated.count,

        deactivatedUsers:
          deactivated.users,

        timings: {
          ...sel.timings,
          ...r.timings,
        },
      });
    } catch (
    e: any
    ) {
      console.error(
        "[GET /sync/microsoft/users] ERROR:",
        e
      );

      res
        .status(500)
        .json({
          ok: false,

          error:
            e?.message ||
            "internal",
        });
    }
  }
);


/* =========================================================
   PUT — SINCRONIZACIÓN INDIVIDUAL POR EMAIL
========================================================= */

/**
 * PUT /api/sync/microsoft/users
 *
 * body:
 * {
 *   empresaId,
 *   email,
 *   concurrency?
 * }
 *
 * Ya no necesita domain.
 */
msSyncRouter.put(
  "/sync/microsoft/users",

  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        empresaId,
        email,
        concurrency,
      } =
        req.body as {
          empresaId?: number;
          email?: string;
          concurrency?: number;
        };

      if (
        !empresaId ||
        isNaN(
          Number(
            empresaId
          )
        )
      ) {
        res
          .status(400)
          .json({
            ok: false,

            error:
              "empresaId requerido (number)",
          });

        return;
      }

      if (
        !email ||
        !email.trim()
      ) {
        res
          .status(400)
          .json({
            ok: false,

            error:
              "email es obligatorio",
          });

        return;
      }

      const empresaIdNumber =
        Number(
          empresaId
        );

      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      /*
       * 1. Obtener dominios configurados.
       */
      const domains =
        await getEmpresaMicrosoftDomains(
          empresaIdNumber
        );

      /*
       * 2. Buscar el usuario en todos los dominios.
       */
      const sel =
        await selectMsUsers(
          domains,
          cleanEmail
        );

      if (
        sel.target.length ===
        0
      ) {
        res
          .status(404)
          .json({
            ok: false,

            error:
              `No se encontró ${cleanEmail} en Microsoft para ninguno de los dominios configurados`,

            domains:
              sel.domains,
          });

        return;
      }

      const normalized =
        normalizeForUpsert(
          sel.target
        );

      /*
       * Sincronización individual:
       *
       * NO se ejecuta deactivateMissingMicrosoftSolicitantes()
       * porque estamos sincronizando solamente un usuario.
       */
      const r =
        await syncMsUsersBatch(
          normalized,
          empresaIdNumber,
          {
            ...(
              typeof concurrency ===
                "number"
                ? {
                  concurrency,
                }
                : {}
            ),
          }
        );

      res.json({
        ok: true,

        empresaId:
          empresaIdNumber,

        domains:
          sel.domains,

        filter:
          cleanEmail,

        ...r,

        timings: {
          ...sel.timings,
          ...r.timings,
        },
      });
    } catch (
    e: any
    ) {
      console.error(
        "[PUT /sync/microsoft/users] ERROR:",
        e
      );

      res
        .status(500)
        .json({
          ok: false,

          error:
            e?.message ||
            "internal",
        });
    }
  }
);


export default msSyncRouter;