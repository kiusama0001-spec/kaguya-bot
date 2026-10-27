import type { DataTag, DefinedInitialDataOptions, DefinedUseQueryResult, QueryClient, QueryKey, UndefinedInitialDataOptions, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ActivityEntry, BadRequestResponse, BotSettings, BotSettingsUpdate, DashboardSummary, GifInput, GifRecord, GroupMember, GroupSettings, GroupSettingsUpdate, HealthStatus, ListActivityParams, ListGroupMembersParams, ListPhrasesParams, ListSanctionsParams, MessageTemplate, MessageTemplateInput, Phrase, PhraseInput, Reminder, ReminderInput, Sanction, SanctionInput, TelegramGroup, UnauthorizedResponse } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns service health without exposing secrets
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof healthCheck>>, TError, Awaited<ReturnType<typeof healthCheck>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof healthCheck>>, TError, Awaited<ReturnType<typeof healthCheck>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getGetDashboardUrl: () => string;
/**
 * @summary Get dashboard summary
 */
export declare const getDashboard: (options?: Parameters<typeof customFetch>[1]) => Promise<DashboardSummary>;
export declare const getGetDashboardQueryKey: () => readonly ["/api/dashboard"];
export declare const getGetDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;
export type GetDashboardQueryError = ErrorType<UnauthorizedResponse>;
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getDashboard>>, TError, Awaited<ReturnType<typeof getDashboard>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getDashboard>>, TError, Awaited<ReturnType<typeof getDashboard>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getListGroupsUrl: () => string;
/**
 * @summary List Telegram groups known to the bot
 */
export declare const listGroups: (options?: Parameters<typeof customFetch>[1]) => Promise<TelegramGroup[]>;
export declare const getListGroupsQueryKey: () => readonly ["/api/groups"];
export declare const getListGroupsQueryOptions: <TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListGroupsQueryResult = NonNullable<Awaited<ReturnType<typeof listGroups>>>;
export type ListGroupsQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListGroups<TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listGroups>>, TError, Awaited<ReturnType<typeof listGroups>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGroups<TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listGroups>>, TError, Awaited<ReturnType<typeof listGroups>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGroups<TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getListGroupMembersUrl: (groupId: string, params?: ListGroupMembersParams) => string;
/**
 * @summary List members seen by Kaguya in a group
 */
export declare const listGroupMembers: (groupId: string, params?: ListGroupMembersParams, options?: Parameters<typeof customFetch>[1]) => Promise<GroupMember[]>;
export declare const getListGroupMembersQueryKey: (groupId: string, params?: ListGroupMembersParams) => readonly [`/api/groups/${string}/members`, ...ListGroupMembersParams[]];
export declare const getListGroupMembersQueryOptions: <TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListGroupMembersParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListGroupMembersQueryResult = NonNullable<Awaited<ReturnType<typeof listGroupMembers>>>;
export type ListGroupMembersQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListGroupMembers<TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params: undefined | ListGroupMembersParams, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, Awaited<ReturnType<typeof listGroupMembers>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGroupMembers<TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListGroupMembersParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, Awaited<ReturnType<typeof listGroupMembers>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGroupMembers<TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListGroupMembersParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getListSanctionsUrl: (groupId: string, params?: ListSanctionsParams) => string;
/**
 * @summary List sanctions for a group
 */
export declare const listSanctions: (groupId: string, params?: ListSanctionsParams, options?: Parameters<typeof customFetch>[1]) => Promise<Sanction[]>;
export declare const getListSanctionsQueryKey: (groupId: string, params?: ListSanctionsParams) => readonly [`/api/groups/${string}/sanctions`, ...ListSanctionsParams[]];
export declare const getListSanctionsQueryOptions: <TData = Awaited<ReturnType<typeof listSanctions>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListSanctionsParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listSanctions>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listSanctions>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListSanctionsQueryResult = NonNullable<Awaited<ReturnType<typeof listSanctions>>>;
export type ListSanctionsQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListSanctions<TData = Awaited<ReturnType<typeof listSanctions>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params: undefined | ListSanctionsParams, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listSanctions>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listSanctions>>, TError, Awaited<ReturnType<typeof listSanctions>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListSanctions<TData = Awaited<ReturnType<typeof listSanctions>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListSanctionsParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listSanctions>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listSanctions>>, TError, Awaited<ReturnType<typeof listSanctions>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListSanctions<TData = Awaited<ReturnType<typeof listSanctions>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, params?: ListSanctionsParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listSanctions>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getCreateSanctionUrl: (groupId: string) => string;
/**
 * @summary Apply a Telegram ban, mute, or warning
 */
export declare const createSanction: (groupId: string, sanctionInput: SanctionInput, options?: Parameters<typeof customFetch>[1]) => Promise<Sanction>;
export declare const getCreateSanctionMutationKey: () => readonly ["createSanction"];
export declare const getCreateSanctionMutationOptions: <TError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSanction>>, TError, CreateSanctionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createSanction>>, TError, CreateSanctionMutationVariables, TContext>;
export type CreateSanctionMutationResult = NonNullable<Awaited<ReturnType<typeof createSanction>>>;
export type CreateSanctionMutationBody = BodyType<SanctionInput>;
export type CreateSanctionMutationError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>;
export type CreateSanctionMutationVariables = {
    groupId: string;
    data: BodyType<SanctionInput>;
};
/**
* @summary Apply a Telegram ban, mute, or warning
*/
export declare const useCreateSanction: <TError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createSanction>>, TError, CreateSanctionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof createSanction>>, TError, CreateSanctionMutationVariables, TContext>;
export declare const getRestoreSanctionUrl: (sanctionId: string) => string;
/**
 * @summary Restore a prior sanction, including saved member permissions
 */
export declare const restoreSanction: (sanctionId: string, options?: Parameters<typeof customFetch>[1]) => Promise<Sanction>;
export declare const getRestoreSanctionMutationKey: () => readonly ["restoreSanction"];
export declare const getRestoreSanctionMutationOptions: <TError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof restoreSanction>>, TError, RestoreSanctionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof restoreSanction>>, TError, RestoreSanctionMutationVariables, TContext>;
export type RestoreSanctionMutationResult = NonNullable<Awaited<ReturnType<typeof restoreSanction>>>;
export type RestoreSanctionMutationError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>;
export type RestoreSanctionMutationVariables = {
    sanctionId: string;
};
/**
* @summary Restore a prior sanction, including saved member permissions
*/
export declare const useRestoreSanction: <TError = ErrorType<BadRequestResponse | UnauthorizedResponse | void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof restoreSanction>>, TError, RestoreSanctionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof restoreSanction>>, TError, RestoreSanctionMutationVariables, TContext>;
export declare const getGetGroupSettingsUrl: (groupId: string) => string;
/**
 * @summary Get settings for a Telegram group
 */
export declare const getGroupSettings: (groupId: string, options?: Parameters<typeof customFetch>[1]) => Promise<GroupSettings>;
export declare const getGetGroupSettingsQueryKey: (groupId: string) => readonly [`/api/groups/${string}/settings`];
export declare const getGetGroupSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getGroupSettings>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetGroupSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getGroupSettings>>>;
export type GetGroupSettingsQueryError = ErrorType<UnauthorizedResponse>;
export declare function useGetGroupSettings<TData = Awaited<ReturnType<typeof getGroupSettings>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, Awaited<ReturnType<typeof getGroupSettings>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetGroupSettings<TData = Awaited<ReturnType<typeof getGroupSettings>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, Awaited<ReturnType<typeof getGroupSettings>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetGroupSettings<TData = Awaited<ReturnType<typeof getGroupSettings>>, TError = ErrorType<UnauthorizedResponse>>(groupId: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getGroupSettings>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getUpdateGroupSettingsUrl: (groupId: string) => string;
/**
 * @summary Update group settings
 */
export declare const updateGroupSettings: (groupId: string, groupSettingsUpdate: GroupSettingsUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<GroupSettings>;
export declare const getUpdateGroupSettingsMutationKey: () => readonly ["updateGroupSettings"];
export declare const getUpdateGroupSettingsMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateGroupSettings>>, TError, UpdateGroupSettingsMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateGroupSettings>>, TError, UpdateGroupSettingsMutationVariables, TContext>;
export type UpdateGroupSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateGroupSettings>>>;
export type UpdateGroupSettingsMutationBody = BodyType<GroupSettingsUpdate>;
export type UpdateGroupSettingsMutationError = ErrorType<UnauthorizedResponse>;
export type UpdateGroupSettingsMutationVariables = {
    groupId: string;
    data: BodyType<GroupSettingsUpdate>;
};
/**
* @summary Update group settings
*/
export declare const useUpdateGroupSettings: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateGroupSettings>>, TError, UpdateGroupSettingsMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof updateGroupSettings>>, TError, UpdateGroupSettingsMutationVariables, TContext>;
export declare const getListTemplatesUrl: () => string;
/**
 * @summary List configured moderation and group-message templates
 */
export declare const listTemplates: (options?: Parameters<typeof customFetch>[1]) => Promise<MessageTemplate[]>;
export declare const getListTemplatesQueryKey: () => readonly ["/api/templates"];
export declare const getListTemplatesQueryOptions: <TData = Awaited<ReturnType<typeof listTemplates>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listTemplates>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTemplates>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListTemplatesQueryResult = NonNullable<Awaited<ReturnType<typeof listTemplates>>>;
export type ListTemplatesQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListTemplates<TData = Awaited<ReturnType<typeof listTemplates>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listTemplates>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listTemplates>>, TError, Awaited<ReturnType<typeof listTemplates>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListTemplates<TData = Awaited<ReturnType<typeof listTemplates>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listTemplates>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listTemplates>>, TError, Awaited<ReturnType<typeof listTemplates>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListTemplates<TData = Awaited<ReturnType<typeof listTemplates>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listTemplates>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getUpdateTemplateUrl: (templateType: "welcome" | "goodbye" | "ban" | "mute" | "warn" | "kick") => string;
/**
 * @summary Save a template and Telegram image file identifier
 */
export declare const updateTemplate: (templateType: "welcome" | "goodbye" | "ban" | "mute" | "warn" | "kick", messageTemplateInput: MessageTemplateInput, options?: Parameters<typeof customFetch>[1]) => Promise<MessageTemplate>;
export declare const getUpdateTemplateMutationKey: () => readonly ["updateTemplate"];
export declare const getUpdateTemplateMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTemplate>>, TError, UpdateTemplateMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTemplate>>, TError, UpdateTemplateMutationVariables, TContext>;
export type UpdateTemplateMutationResult = NonNullable<Awaited<ReturnType<typeof updateTemplate>>>;
export type UpdateTemplateMutationBody = BodyType<MessageTemplateInput>;
export type UpdateTemplateMutationError = ErrorType<UnauthorizedResponse>;
export type UpdateTemplateMutationVariables = {
    templateType: 'welcome' | 'goodbye' | 'ban' | 'mute' | 'warn' | 'kick';
    data: BodyType<MessageTemplateInput>;
};
/**
* @summary Save a template and Telegram image file identifier
*/
export declare const useUpdateTemplate: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTemplate>>, TError, UpdateTemplateMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof updateTemplate>>, TError, UpdateTemplateMutationVariables, TContext>;
export declare const getGetBotSettingsUrl: () => string;
/**
 * @summary Get Kaguya service settings
 */
export declare const getBotSettings: (options?: Parameters<typeof customFetch>[1]) => Promise<BotSettings>;
export declare const getGetBotSettingsQueryKey: () => readonly ["/api/bot/settings"];
export declare const getGetBotSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getBotSettings>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetBotSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getBotSettings>>>;
export type GetBotSettingsQueryError = ErrorType<UnauthorizedResponse>;
export declare function useGetBotSettings<TData = Awaited<ReturnType<typeof getBotSettings>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, Awaited<ReturnType<typeof getBotSettings>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetBotSettings<TData = Awaited<ReturnType<typeof getBotSettings>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, Awaited<ReturnType<typeof getBotSettings>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetBotSettings<TData = Awaited<ReturnType<typeof getBotSettings>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getBotSettings>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getUpdateBotSettingsUrl: () => string;
/**
 * @summary Update Kaguya service settings
 */
export declare const updateBotSettings: (botSettingsUpdate: BotSettingsUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<BotSettings>;
export declare const getUpdateBotSettingsMutationKey: () => readonly ["updateBotSettings"];
export declare const getUpdateBotSettingsMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateBotSettings>>, TError, UpdateBotSettingsMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateBotSettings>>, TError, UpdateBotSettingsMutationVariables, TContext>;
export type UpdateBotSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateBotSettings>>>;
export type UpdateBotSettingsMutationBody = BodyType<BotSettingsUpdate>;
export type UpdateBotSettingsMutationError = ErrorType<UnauthorizedResponse>;
export type UpdateBotSettingsMutationVariables = {
    data: BodyType<BotSettingsUpdate>;
};
/**
* @summary Update Kaguya service settings
*/
export declare const useUpdateBotSettings: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateBotSettings>>, TError, UpdateBotSettingsMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof updateBotSettings>>, TError, UpdateBotSettingsMutationVariables, TContext>;
export declare const getListPhrasesUrl: (params?: ListPhrasesParams) => string;
/**
 * @summary Search the response library
 */
export declare const listPhrases: (params?: ListPhrasesParams, options?: Parameters<typeof customFetch>[1]) => Promise<Phrase[]>;
export declare const getListPhrasesQueryKey: (params?: ListPhrasesParams) => readonly ["/api/phrases", ...ListPhrasesParams[]];
export declare const getListPhrasesQueryOptions: <TData = Awaited<ReturnType<typeof listPhrases>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListPhrasesParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listPhrases>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPhrases>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListPhrasesQueryResult = NonNullable<Awaited<ReturnType<typeof listPhrases>>>;
export type ListPhrasesQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListPhrases<TData = Awaited<ReturnType<typeof listPhrases>>, TError = ErrorType<UnauthorizedResponse>>(params: undefined | ListPhrasesParams, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listPhrases>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listPhrases>>, TError, Awaited<ReturnType<typeof listPhrases>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListPhrases<TData = Awaited<ReturnType<typeof listPhrases>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListPhrasesParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listPhrases>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listPhrases>>, TError, Awaited<ReturnType<typeof listPhrases>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListPhrases<TData = Awaited<ReturnType<typeof listPhrases>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListPhrasesParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listPhrases>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getCreatePhraseUrl: () => string;
/**
 * @summary Add a phrase to the local response library
 */
export declare const createPhrase: (phraseInput: PhraseInput, options?: Parameters<typeof customFetch>[1]) => Promise<Phrase>;
export declare const getCreatePhraseMutationKey: () => readonly ["createPhrase"];
export declare const getCreatePhraseMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPhrase>>, TError, CreatePhraseMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createPhrase>>, TError, CreatePhraseMutationVariables, TContext>;
export type CreatePhraseMutationResult = NonNullable<Awaited<ReturnType<typeof createPhrase>>>;
export type CreatePhraseMutationBody = BodyType<PhraseInput>;
export type CreatePhraseMutationError = ErrorType<UnauthorizedResponse>;
export type CreatePhraseMutationVariables = {
    data: BodyType<PhraseInput>;
};
/**
* @summary Add a phrase to the local response library
*/
export declare const useCreatePhrase: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createPhrase>>, TError, CreatePhraseMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof createPhrase>>, TError, CreatePhraseMutationVariables, TContext>;
export declare const getListGifsUrl: () => string;
/**
 * @summary List registered Telegram GIF identifiers
 */
export declare const listGifs: (options?: Parameters<typeof customFetch>[1]) => Promise<GifRecord[]>;
export declare const getListGifsQueryKey: () => readonly ["/api/gifs"];
export declare const getListGifsQueryOptions: <TData = Awaited<ReturnType<typeof listGifs>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGifs>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listGifs>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListGifsQueryResult = NonNullable<Awaited<ReturnType<typeof listGifs>>>;
export type ListGifsQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListGifs<TData = Awaited<ReturnType<typeof listGifs>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGifs>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listGifs>>, TError, Awaited<ReturnType<typeof listGifs>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGifs<TData = Awaited<ReturnType<typeof listGifs>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGifs>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listGifs>>, TError, Awaited<ReturnType<typeof listGifs>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListGifs<TData = Awaited<ReturnType<typeof listGifs>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listGifs>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getCreateGifUrl: () => string;
/**
 * @summary Register an authentic Telegram file identifier
 */
export declare const createGif: (gifInput: GifInput, options?: Parameters<typeof customFetch>[1]) => Promise<GifRecord>;
export declare const getCreateGifMutationKey: () => readonly ["createGif"];
export declare const getCreateGifMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGif>>, TError, CreateGifMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createGif>>, TError, CreateGifMutationVariables, TContext>;
export type CreateGifMutationResult = NonNullable<Awaited<ReturnType<typeof createGif>>>;
export type CreateGifMutationBody = BodyType<GifInput>;
export type CreateGifMutationError = ErrorType<UnauthorizedResponse>;
export type CreateGifMutationVariables = {
    data: BodyType<GifInput>;
};
/**
* @summary Register an authentic Telegram file identifier
*/
export declare const useCreateGif: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGif>>, TError, CreateGifMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof createGif>>, TError, CreateGifMutationVariables, TContext>;
export declare const getListRemindersUrl: () => string;
/**
 * @summary List persisted reminders
 */
export declare const listReminders: (options?: Parameters<typeof customFetch>[1]) => Promise<Reminder[]>;
export declare const getListRemindersQueryKey: () => readonly ["/api/reminders"];
export declare const getListRemindersQueryOptions: <TData = Awaited<ReturnType<typeof listReminders>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listReminders>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listReminders>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListRemindersQueryResult = NonNullable<Awaited<ReturnType<typeof listReminders>>>;
export type ListRemindersQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListReminders<TData = Awaited<ReturnType<typeof listReminders>>, TError = ErrorType<UnauthorizedResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listReminders>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listReminders>>, TError, Awaited<ReturnType<typeof listReminders>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListReminders<TData = Awaited<ReturnType<typeof listReminders>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listReminders>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listReminders>>, TError, Awaited<ReturnType<typeof listReminders>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListReminders<TData = Awaited<ReturnType<typeof listReminders>>, TError = ErrorType<UnauthorizedResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listReminders>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getCreateReminderUrl: () => string;
/**
 * @summary Schedule a persistent Telegram reminder
 */
export declare const createReminder: (reminderInput: ReminderInput, options?: Parameters<typeof customFetch>[1]) => Promise<Reminder>;
export declare const getCreateReminderMutationKey: () => readonly ["createReminder"];
export declare const getCreateReminderMutationOptions: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createReminder>>, TError, CreateReminderMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createReminder>>, TError, CreateReminderMutationVariables, TContext>;
export type CreateReminderMutationResult = NonNullable<Awaited<ReturnType<typeof createReminder>>>;
export type CreateReminderMutationBody = BodyType<ReminderInput>;
export type CreateReminderMutationError = ErrorType<UnauthorizedResponse>;
export type CreateReminderMutationVariables = {
    data: BodyType<ReminderInput>;
};
/**
* @summary Schedule a persistent Telegram reminder
*/
export declare const useCreateReminder: <TError = ErrorType<UnauthorizedResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createReminder>>, TError, CreateReminderMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof createReminder>>, TError, CreateReminderMutationVariables, TContext>;
export declare const getListActivityUrl: (params?: ListActivityParams) => string;
/**
 * @summary List recent administrative and bot activity
 */
export declare const listActivity: (params?: ListActivityParams, options?: Parameters<typeof customFetch>[1]) => Promise<ActivityEntry[]>;
export declare const getListActivityQueryKey: (params?: ListActivityParams) => readonly ["/api/activity", ...ListActivityParams[]];
export declare const getListActivityQueryOptions: <TData = Awaited<ReturnType<typeof listActivity>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListActivityParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listActivity>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listActivity>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ListActivityQueryResult = NonNullable<Awaited<ReturnType<typeof listActivity>>>;
export type ListActivityQueryError = ErrorType<UnauthorizedResponse>;
export declare function useListActivity<TData = Awaited<ReturnType<typeof listActivity>>, TError = ErrorType<UnauthorizedResponse>>(params: undefined | ListActivityParams, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof listActivity>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof listActivity>>, TError, Awaited<ReturnType<typeof listActivity>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListActivity<TData = Awaited<ReturnType<typeof listActivity>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListActivityParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listActivity>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof listActivity>>, TError, Awaited<ReturnType<typeof listActivity>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useListActivity<TData = Awaited<ReturnType<typeof listActivity>>, TError = ErrorType<UnauthorizedResponse>>(params?: ListActivityParams, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof listActivity>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export {};
//# sourceMappingURL=api.d.ts.map