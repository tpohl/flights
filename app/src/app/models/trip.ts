export class Trip {
    _id!: string;
    name!: string;
    flightIds: string[] = [];
    userId!: string;
    _objectReference?: string;
}
