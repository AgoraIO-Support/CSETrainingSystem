import { MaterialService } from './material.service.js'
import { EnrollmentService } from './enrollment.service.js'
import { CascadeService } from './cascade.service.js'

export interface Services {
    materialService: MaterialService
    enrollmentService: EnrollmentService
    cascadeService: CascadeService
}

export function buildServices(): Services {
    return {
        materialService: new MaterialService(),
        enrollmentService: new EnrollmentService(),
        cascadeService: new CascadeService(),
    }
}
