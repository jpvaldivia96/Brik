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
        .max(100, 'El contratista no puede exceder 100 caracteres')
        .optional()
        .default(''),

    role: z
        .string()
        .max(50, 'El cargo no puede exceder 50 caracteres')
        .optional()
        .default(''),

    phone: z
        .string()
        .max(20, 'El teléfono no puede exceder 20 caracteres')
        .optional()
        .default(''),

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
        .max(100, 'El contacto de emergencia no puede exceder 100 caracteres')
        .optional()
        .default(''),

    bloodType: z
        .string()
        .max(10, 'El tipo de sangre no puede exceder 10 caracteres')
        .regex(/^(A|B|AB|O)[+-]?$|^$/, 'Tipo de sangre inválido (ej: O+, A-, AB+)')
        .optional()
        .default(''),

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
