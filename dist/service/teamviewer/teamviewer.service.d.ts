type GetConnectionsParams = {
    fromDate?: string;
    toDate?: string;
    offsetId?: string;
    userId?: string;
    groupId?: string;
    deviceId?: string;
};
export interface TeamViewerSession {
    id: string;
    deviceid?: string | number | null;
    devicename?: string | null;
    groupid?: string | number | null;
    groupname?: string | null;
    start_date: string;
    end_date?: string | null;
    duration?: number | null;
}
export declare function getConnections(params?: GetConnectionsParams): Promise<any>;
export declare function getAllConnectionsHistorical(params: {
    fromDate?: string;
    toDate?: string;
}): Promise<TeamViewerSession[]>;
export declare function calcDurationMinutes(session: TeamViewerSession): number;
export declare function getDevice(deviceId: string): Promise<any>;
export {};
//# sourceMappingURL=teamviewer.service.d.ts.map