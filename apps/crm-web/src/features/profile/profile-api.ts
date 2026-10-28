import { http } from "@/lib/http";
import type { UserProfile } from "@/types";

export const getProfileRequest = () => http<UserProfile>("/api/profile");
