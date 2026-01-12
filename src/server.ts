import express from "express";
import { scraper } from "./index.js";

type ParsedReview = {
    review_id: string;
    user: {
        name: string;
        link: string | null;
        contributor_id: string | null;
        reviews: number;
        photos: number;
        thumbnail: string | null;
    };
    link: string | null;
    source: "Google";
    text: string | null;
    rating: number | null;
    date: string | null;
};

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MASTER_API_KEY = process.env.MASTER_API_KEY ?? "";
let reviewCount = 0;

function parseRawReviews(rawReviews: unknown): ParsedReview[] {
    if (!rawReviews || !Array.isArray(rawReviews)) {
        return [];
    }

    return rawReviews
        .map((reviewSet) => {
            try {
                if (!Array.isArray(reviewSet)) {
                    return null;
                }

                const reviewData = reviewSet[0] as any[] | undefined;
                if (!reviewData) return null;

                const reviewId = reviewData[0] as string | undefined;
                const authorBlock = reviewData[1]?.[4]?.[5] as any[] | undefined;
                const contentBlock = reviewData[2] as any[] | undefined;
                const dateString = reviewData[1]?.[6] as string | undefined;
                const reviewLink = reviewData[4]?.[3]?.[0] as string | undefined;

                if (!authorBlock) {
                    return null;
                }

                const parsedReview: ParsedReview = {
                    review_id: reviewId ?? "",
                    user: {
                        name: authorBlock[0] ?? "",
                        link: authorBlock[2]?.[0] ?? null,
                        contributor_id: authorBlock[3] ?? null,
                        reviews: authorBlock[5] ?? 0,
                        photos: authorBlock[6] ?? 0,
                        thumbnail: authorBlock[1] ?? null,
                    },
                    link: reviewLink ?? null,
                    source: "Google",
                    text: contentBlock?.[15]?.[0]?.[0] ?? null,
                    rating: contentBlock?.[0]?.[0] ?? null,
                    date: dateString ?? null,
                };

                if (!parsedReview.user.name || !parsedReview.rating) {
                    return null;
                }

                return parsedReview;
            } catch {
                return null;
            }
        })
        .filter((review): review is ParsedReview => review !== null);
}

async function getReviews(url: string, options: { sort_type?: string; pages?: string | number } = {}) {
    const finalOptions = { ...options, clean: false };
    const rawReviews = await scraper(url, finalOptions);
    if (!rawReviews || rawReviews === 0) {
        return [];
    }

    return parseRawReviews(rawReviews);
}

app.get("/reviews", async (req, res) => {
    const { url, key, sort_by, pages } = req.query;

    if (!MASTER_API_KEY || key !== MASTER_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Parameter 'url' tidak boleh kosong" });
    }

    try {
        const startTime = Date.now();
        const pagesValue = typeof pages === "string" ? Number.parseInt(pages, 10) : 1;
        const options = {
            sort_type: typeof sort_by === "string" ? sort_by : "relevent",
            pages: Number.isNaN(pagesValue) ? 1 : pagesValue,
        };
        const reviews = await getReviews(decodeURIComponent(url), options);

        reviewCount += 1;

        return res.json({
            search_metadata: {
                id: `search_${Math.random().toString(36).substring(2, 9)}`,
                status: "Success",
                created_at: new Date().toISOString(),
                total_time_taken: Number(((Date.now() - startTime) / 1000).toFixed(2)),
            },
            search_parameters: {
                engine: "Maps_reviews",
                url: decodeURIComponent(url),
                sort_by: options.sort_type,
                pages_requested: options.pages,
            },
            place_result: {},
            reviews_count: reviews.length,
            reviews,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return res.status(500).json({ error: "Gagal memproses permintaan.", details: message });
    }
});

app.get("/health", (_req, res) => {
    const uptime = process.uptime();
    return res.json({
        status: "ok",
        uptime: `${Math.floor(uptime)} seconds`,
        node_version: process.version,
        memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        review_count: reviewCount,
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
