import * as faceapi from 'face-api.js';

// Configuration
const MODEL_URL = '/models';
// Using TinyFaceDetector for better mobile compatibility compared to SSD MobileNet
const FACE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

export class FaceService {
    private static instance: FaceService;
    private isLoaded: boolean = false;
    private labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];

    private constructor() { }

    public static getInstance(): FaceService {
        if (!FaceService.instance) {
            FaceService.instance = new FaceService();
        }
        return FaceService.instance;
    }

    public async loadModels(): Promise<void> {
        if (this.isLoaded) return;

        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), // Changed from ssdMobilenetv1
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
            this.isLoaded = true;
            console.log('FaceAPI models loaded (TinyFace)');
        } catch (error) {
            console.error('Error loading FaceAPI models:', error);
            throw error;
        }
    }

    public async getDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array | undefined> {
        if (!this.isLoaded) await this.loadModels();

        console.log('FaceService: Starting detection (TinyFace)...');
        try {
            const detection = await faceapi
                .detectSingleFace(imageElement, FACE_DETECTOR_OPTIONS)
                .withFaceLandmarks()
                .withFaceDescriptor();

            console.log('FaceService: Detection result:', detection ? 'Found' : 'Null');
            if (detection) {
                console.log('FaceService: Score:', detection.detection.score);
            }
            return detection?.descriptor;
        } catch (e) {
            console.error('FaceService: Detection error', e);
            throw e;
        }
    }

    public async loadLabeledDescriptors(people: { id: string; face_descriptor: string | null }[]) {
        this.labeledDescriptors = people
            .filter(p => p.face_descriptor)
            .map(p => {
                try {
                    const descriptor = new Float32Array(JSON.parse(p.face_descriptor!));
                    return new faceapi.LabeledFaceDescriptors(p.id, [descriptor]);
                } catch (e) {
                    console.error(`Error parsing descriptor for person ${p.id}`, e);
                    return null;
                }
            })
            .filter((d): d is faceapi.LabeledFaceDescriptors => d !== null);
    }

    public async findMatch(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{ id: string; distance: number } | null> {
        if (!this.isLoaded || this.labeledDescriptors.length === 0) return null;

        const descriptor = await this.getDescriptor(imageElement);
        if (!descriptor) return null;

        const faceMatcher = new faceapi.FaceMatcher(this.labeledDescriptors, 0.6);
        const match = faceMatcher.findBestMatch(descriptor);

        if (match.label === 'unknown') return null;

        return { id: match.label, distance: match.distance };
    }
}

export const faceService = FaceService.getInstance();
