import { z } from 'zod';

// Schema de validación para registro de trabajador
export const workerFormSchema = z.object({
    ci: z
        .string()
        .min(1, 'El CI es obligatorio')
        .min(5, 'El CI debe tener al menos 5 caracteres')
        .max(20, 'El CI no puede exceder 20 caracteres')
        .regex(/^[0-9A-Za-z-]+$/, 'El CI solo puede contener números, letras y guiones'),

    fullName: z
        .string()
        .min(1, 'El nombre es obligatorio')
        .min(3, 'El nombre debe tener al menos 3 caracteres')
        .max(100, 'El nombre no puede exceder 100 caracteres'),

    contractor: z
        .string()
        .min(1, 'El contratista es obligatorio')
        .max(100, 'El contratista no puede exceder 100 caracteres'),

    role: z
        .string()
        .min(1, 'El cargo/rol es obligatorio')
        .max(50, 'El cargo no puede exceder 50 caracteres'),

    phone: z
        .string()
        .min(1, 'El teléfono es obligatorio')
        .max(20, 'El teléfono no puede exceder 20 caracteres'),

    insuranceNumber: z
        .string()
        .max(50, 'El número de seguro no puede exceder 50 caracteres')
        .optional()
        .default(''),

    insuranceExpiry: z
        .string()
        .optional()
        .default(''),

    emergencyContact: z
        .string()
        .min(1, 'El contacto de emergencia es obligatorio')
        .max(100, 'El contacto de emergencia no puede exceder 100 caracteres'),

    bloodType: z
        .string()
        .min(1, 'El tipo de sangre es obligatorio')
        .max(10, 'El tipo de sangre no puede exceder 10 caracteres')
        .regex(/^(A|B|AB|O)[+-]$/, 'Tipo de sangre inválido (ej: O+, A-, AB+)'),

    inductionCompleted: z.boolean().default(false),

    isInspector: z.boolean().default(false),
});

// Tipo inferido del schema
export type WorkerFormData = z.infer<typeof workerFormSchema>;

// Valores iniciales del formulario
export const workerFormDefaults: WorkerFormData = {
    ci: '',
    fullName: '',
    contractor: '',
    role: '',
    phone: '',
    insuranceNumber: '',
    insuranceExpiry: '',
    emergencyContact: '',
    bloodType: '',
    inductionCompleted: false,
    isInspector: false,
};
