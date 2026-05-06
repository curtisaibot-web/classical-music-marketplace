import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface EventTeacher {
  id: number;
  userId: string;
  bio: string | null;
  instruments: string[];
  genres: string[];
  city: string | null;
  country: string | null;
  hourlyRate: number | null;
  averageRating: number;
  reviewCount: number;
  isVerified: boolean;
  profileImageUrl: string | null;
  lastMinuteAvailable?: boolean;
  user?: {
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  };
}

export interface EventDetails {
  id: number;
  eventTypes: string[];
  venueTypes: string[];
  minHeadcount: number | null;
  maxHeadcount: number | null;
  travelRadiusMiles: number | null;
  requiresDeposit: boolean;
  depositPercent: number | null;
  repertoire: string | null;
  setupTimeMinutes: number | null;
  performanceDurationMinutes: number | null;
  additionalInfo: string | null;
}

export interface EventListing {
  id: number;
  teacherId: string;
  type: "event";
  status: "active" | "inactive" | "draft";
  title: string;
  description: string | null;
  instrument: string | null;
  priceInCents: number;
  currency: string;
  imageUrl: string | null;
  tags: string[];
  isOnline: boolean;
  city: string | null;
  country: string | null;
  eventDetails: EventDetails | null;
  teacher?: EventTeacher;
  createdAt: Date;
}

export interface ListEventsResponse {
  events: EventListing[];
  total: number;
}

export interface ListEventsParams {
  instrument?: string;
  city?: string;
  eventType?: string;
  lastMinute?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateEventBookingRequestBody {
  listingId?: number;
  teacherId: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  headcount?: number;
  durationMinutes?: number;
  notes?: string;
  instrument?: string;
}

export interface EventBookingResponse {
  id: number;
  studentId: string;
  teacherId: string;
  listingId: number | null;
  type: string;
  status: string;
  priceInCents: number;
  platformFeeInCents: number;
  surgePercent: number | null;
  surgeAmountInCents: number | null;
  expiresAt: string | null;
  currency: string;
  eventType: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  headcount: number | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
}

export interface AvailabilityResponse {
  bookedDates: Date[];
}

export interface LastMinuteAvailabilityBody {
  lastMinuteAvailable: boolean;
  lastMinuteFromDate?: string | null;
  lastMinuteToDate?: string | null;
  minNoticeHours?: number;
}

export interface LastMinuteAvailabilityResponse {
  lastMinuteAvailable: boolean;
  lastMinuteFromDate: string | null;
  lastMinuteToDate: string | null;
  minNoticeHours: number;
}

export const getListEventsQueryKey = (params?: ListEventsParams) =>
  ["events", params] as const;

export const getGetEventQueryKey = (id: number) =>
  ["event", id] as const;

export const getEventAvailabilityQueryKey = (teacherId: string) =>
  ["event-availability", teacherId] as const;

export const getLastMinuteAvailabilityQueryKey = () =>
  ["last-minute-availability"] as const;

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export function useListEvents(
  params?: ListEventsParams,
  options?: Partial<UseQueryOptions<ListEventsResponse>>
) {
  return useQuery<ListEventsResponse>({
    queryKey: getListEventsQueryKey(params),
    queryFn: () =>
      customFetch<ListEventsResponse>(`/api/events${buildQueryString(params as Record<string, unknown>)}`),
    ...options,
  });
}

export function useGetEvent(
  id: number,
  options?: Partial<UseQueryOptions<EventListing>>
) {
  return useQuery<EventListing>({
    queryKey: getGetEventQueryKey(id),
    queryFn: () => customFetch<EventListing>(`/api/events/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useGetEventAvailability(
  teacherId: string,
  options?: Partial<UseQueryOptions<AvailabilityResponse>>
) {
  return useQuery<AvailabilityResponse>({
    queryKey: getEventAvailabilityQueryKey(teacherId),
    queryFn: () =>
      customFetch<AvailabilityResponse>(`/api/events/availability/${teacherId}`),
    enabled: !!teacherId,
    ...options,
  });
}

export function useCreateEventBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventBookingRequestBody) =>
      customFetch<EventBookingResponse>("/api/event-booking-requests", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useGetLastMinuteAvailability(
  options?: Partial<UseQueryOptions<LastMinuteAvailabilityResponse>>
) {
  return useQuery<LastMinuteAvailabilityResponse>({
    queryKey: getLastMinuteAvailabilityQueryKey(),
    queryFn: () =>
      customFetch<LastMinuteAvailabilityResponse>("/api/teachers/me/last-minute"),
    ...options,
  });
}

export function useUpdateLastMinuteAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LastMinuteAvailabilityBody) =>
      customFetch<LastMinuteAvailabilityResponse>("/api/teachers/me/last-minute", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getLastMinuteAvailabilityQueryKey() });
    },
  });
}
