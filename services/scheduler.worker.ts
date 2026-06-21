import { generateSchedule } from './schedulerEngine';

self.onmessage = (e: MessageEvent) => {
    try {
        const { unassigned, currentSchedule, faculty, batches, rooms, courses, departments, constraints, globalSchedule } = e.data;

        const result = generateSchedule(
            unassigned,
            currentSchedule,
            faculty,
            batches,
            rooms,
            courses,
            departments,
            constraints,
            globalSchedule
        );

        self.postMessage({ type: 'SUCCESS', payload: result });
    } catch (error) {
        self.postMessage({ type: 'ERROR', payload: error });
    }
};

export { };