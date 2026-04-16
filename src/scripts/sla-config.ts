import { prisma } from "../lib/prisma.js";

// En un script o en tu seed.ts
await prisma.slaConfig.createMany({
    skipDuplicates: true,
    data: [
        { priority: "LOW",    firstResponseMinutes: 60,  resolutionMinutes: 240 },
        { priority: "NORMAL", firstResponseMinutes: 60,  resolutionMinutes: 90  },
        { priority: "HIGH",   firstResponseMinutes: 30,  resolutionMinutes: 60  },
        { priority: "URGENT", firstResponseMinutes: 30,  resolutionMinutes: 45  },
    ],
});