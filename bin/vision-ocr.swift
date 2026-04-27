import Foundation
import Vision
import PDFKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/**
 * Swift OCR & PDF Renderer for Smart Renamer.
 * Uses native Apple Vision Framework and PDFKit.
 * 
 * Requirements:
 * - OCR all pages (accurate level).
 * - Render first 4 pages of PDF to a single vertical JPG.
 * - Resize pages to max 2000px longest dimension.
 * - Concatenate text with separators.
 */

struct OCRResult: Codable {
    let text: String
    let imagePath: String?
    let error: String?
}

func exitWithError(_ message: String) -> Never {
    let result = OCRResult(text: "", imagePath: nil, error: message)
    if let data = try? JSONEncoder().encode(result), let output = String(data: data, encoding: .utf8) {
        print(output)
    }
    exit(1)
}

// 1. Argument Parsing
let args = CommandLine.arguments
if args.count < 2 {
    exitWithError("Usage: vision-ocr <input-file>")
}

let inputPath = args[1]
let fileURL = URL(fileURLWithPath: inputPath)

if !FileManager.default.fileExists(atPath: inputPath) {
    exitWithError("File not found: \(inputPath)")
}

// 2. OCR Function
func performOCR(on image: CGImage) -> String {
    var recognizedText = ""
    let requestHandler = VNImageRequestHandler(cgImage: image, options: [:])
    let request = VNRecognizeTextRequest { request, error in
        guard let observations = request.results as? [VNRecognizedTextObservation], error == nil else {
            return
        }
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            recognizedText += candidate.string + "\n"
        }
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    try? requestHandler.perform([request])
    return recognizedText
}

// 3. Processing
var allText = ""
var renderedImagePath: String? = nil

let isPDF = fileURL.pathExtension.lowercased() == "pdf"

if isPDF {
    guard let pdfDocument = PDFDocument(url: fileURL) else {
        exitWithError("Failed to load PDF document")
    }
    
    let pageCount = pdfDocument.pageCount
    var imagesToStitch: [CGImage] = []
    
    for i in 0..<pageCount {
        guard let page = pdfDocument.page(at: i) else { continue }
        
        // OCR part
        let pageRect = page.bounds(for: .mediaBox)
        // High resolution for OCR
        let ocrScale: CGFloat = 2.0
        let ocrSize = CGSize(width: pageRect.width * ocrScale, height: pageRect.height * ocrScale)
        
        if let pageImage = page.thumbnail(of: ocrSize, for: .mediaBox).cgImage(forProposedRect: nil, context: nil, hints: nil) {
            let pageText = performOCR(on: pageImage)
            allText += "\n\n--- STRANA \(i + 1) ---\n\n" + pageText
            
            // Rendering part (first 4 pages)
            if i < 4 {
                // Resize for LLM (max 2000px dimension)
                let maxDim: CGFloat = 2000.0
                let currentMax = max(pageRect.width, pageRect.height)
                let scale = min(maxDim / currentMax, 1.0)
                let renderSize = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)
                
                if let renderImage = page.thumbnail(of: renderSize, for: .mediaBox).cgImage(forProposedRect: nil, context: nil, hints: nil) {
                    imagesToStitch.append(renderImage)
                }
            }
        }
    }
    
    // Stitch images vertically
    if !imagesToStitch.isEmpty {
        let totalWidth = imagesToStitch.map { CGFloat($0.width) }.max() ?? 0
        let totalHeight = imagesToStitch.reduce(0) { $0 + CGFloat($1.height) }
        
        if let context = CGContext(data: nil, width: Int(totalWidth), height: Int(totalHeight), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            
            var currentY = totalHeight
            for img in imagesToStitch {
                currentY -= CGFloat(img.height)
                let rect = CGRect(x: 0, y: currentY, width: CGFloat(img.width), height: CGFloat(img.height))
                context.draw(img, in: rect)
            }
            
            if let finalImage = context.makeImage() {
                let tempDir = NSTemporaryDirectory()
                let tempURL = URL(fileURLWithPath: tempDir).appendingPathComponent(UUID().uuidString + ".jpg")
                
                if let destination = CGImageDestinationCreateWithURL(tempURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) {
                    let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.8]
                    CGImageDestinationAddImage(destination, finalImage, options as CFDictionary)
                    if CGImageDestinationFinalize(destination) {
                        renderedImagePath = tempURL.path
                    }
                }
            }
        }
    }
    
} else {
    // Single image OCR
    if let imageSource = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
       let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) {
        allText = performOCR(on: image)
        // For images, we don't necessarily need a "rendered" copy since we can use the original,
        // but PRD says "dočasná kopie se nevytváří". However, Node.js side might expect an image path.
        // We will pass the original path as renderedImagePath to stay consistent.
        renderedImagePath = inputPath
    } else {
        exitWithError("Failed to load image")
    }
}

// 4. Output Result
let finalResult = OCRResult(text: allText.trimmingCharacters(in: .whitespacesAndNewlines), imagePath: renderedImagePath, error: nil)
if let data = try? JSONEncoder().encode(finalResult), let output = String(data: data, encoding: .utf8) {
    print(output)
}
