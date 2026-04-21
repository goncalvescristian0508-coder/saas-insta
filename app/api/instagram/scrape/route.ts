import { NextResponse } from "next/server";
import {
  runWithApifyRotation,
  ApifyAllTokensExhaustedError,
  ApifyTokensNotConfiguredError,
} from "@/lib/apifyRotation";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "Username é obrigatório" }, { status: 400 });
    }

    const cleanUsername = username.replace("@", "").trim();

    const inputReels = {
      username: [cleanUsername],
      resultsLimit: 9999,
    };

    const inputProfile = {
      usernames: [cleanUsername],
    };

    const { items, profileItem } = await runWithApifyRotation(async (client) => {
      const [runReels, runProfile] = await Promise.all([
        client.actor("apify/instagram-reel-scraper").call(inputReels),
        client.actor("apify/instagram-profile-scraper").call(inputProfile),
      ]);

      const [reelsDataset, profileDataset] = await Promise.all([
        client.dataset(runReels.defaultDatasetId).listItems(),
        client.dataset(runProfile.defaultDatasetId).listItems(),
      ]);

      return {
        items: reelsDataset.items,
        profileItem: profileDataset.items[0] || {},
      };
    });

    const videos = items.map((post: any, index: number) => ({
      id: index + 1,
      shortCode: post.shortCode || "",
      caption: post.caption || "(sem legenda)",
      videoUrl: post.videoUrl || "",
      thumbnailUrl: post.displayUrl || post.thumbnailUrl || "",
      likes: post.likesCount || 0,
      comments: post.commentsCount || 0,
      views: post.videoViewCount || post.viewCount || post.playCount || 0,
      timestamp: post.timestamp || "",
    }));

    const profileData = {
      username: cleanUsername,
      fullName: profileItem.fullName || items[0]?.ownerFullName || cleanUsername,
      profilePicUrl: profileItem.profilePicUrlHD || profileItem.profilePicUrl || "",
      followersCount: profileItem.followersCount || 0,
    };

    return NextResponse.json({
      success: true,
      profile: profileData,
      videos,
      totalPosts: items.length,
      totalVideos: videos.length,
    });
  } catch (error: unknown) {
    if (error instanceof ApifyTokensNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof ApifyAllTokensExhaustedError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Scrape error:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
