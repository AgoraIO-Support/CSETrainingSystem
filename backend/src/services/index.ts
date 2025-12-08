import { MaterialService } from './material.service.js'
import { EnrollmentService } from './enrollment.service.js'

export interface Services {
    materialService: MaterialService
    enrollmentService: EnrollmentService
}

export function buildServices(): Services {
    return {
        materialService: new MaterialService(),
        enrollmentService: new EnrollmentService(),
    }
}
