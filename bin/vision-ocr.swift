import Foundation
import Vision
import PDFKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/**
 * Swift OCR & PDF Renderer - Page-by-Page Output.
 */

struct PageResult: Codable {
    let text: String
    let imagePath: String?
}

struct OCRResult: Codable {
    let pages: [PageResult]
    let error: String?
}

func exitWithError(_ message: String) -> Never {
    let result = OCRResult(pages: [], error: message)
    if let data = try? JSONEncoder().encode(result), let output = String(data: data, encoding: .utf8) {
        print(output)
    }
    exit(1)
}

func performOCR(on image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["cs-CZ", "en-US"]
    
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])
    
    let observations = request.results ?? []
    return observations.compactMap { $0.topCandidates(1).first?.string }.join(separator: " ")
}

extension Array where Element == String {
    func join(separator: String) -> String {
        return self.joined(separator: separator)
    }
}

// 1. Argument Parsing
let arguments = CommandLine.arguments
guard arguments.count > 1 else { exitWithError("No input file provided") }
let filePath = arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

// 2. PDF Processing
guard let pdfDocument = PDFDocument(url: fileURL) else {
    exitWithError("Failed to load PDF document")
}

var pageResults: [PageResult] = []
let tempDir = NSTemporaryDirectory()

for i in 0..<min(pdfDocument.pageCount, 10) { // Limit to 10 pages for sanity
    guard let page = pdfDocument.page(at: i) else { continue }
    let pageRect = page.bounds(for: .mediaBox)
    
    // OCR rendering (high DPI)
    let ocrSize = CGSize(width: pageRect.width * 2, height: pageRect.height * 2)
    if let pageImage = page.thumbnail(of: ocrSize, for: .mediaBox).cgImage(forProposedRect: nil, context: nil, hints: nil) {
        let text = performOCR(on: pageImage)
        
        // Vision rendering (max 2000px for AI)
        var imagePath: String? = nil
        let maxDim: CGFloat = 2000.0
        let scale = min(maxDim / max(pageRect.width, pageRect.height), 1.0)
        let renderSize = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)
        
        if let renderImage = page.thumbnail(of: renderSize, for: .mediaBox).cgImage(forProposedRect: nil, context: nil, hints: nil) {
            let tempURL = URL(fileURLWithPath: tempDir).appendingPathComponent(UUID().uuidString + "_p\(i).jpg")
            if let destination = CGImageDestinationCreateWithURL(tempURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) {
                let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.8]
                CGImageDestinationAddImage(destination, renderImage, options as CFDictionary)
                if CGImageDestinationFinalize(destination) {
                    imagePath = tempURL.path
                }
            }
        }
        pageResults.append(PageResult(text: text, imagePath: imagePath))
    }
}

let finalResult = OCRResult(pages: pageResults, error: nil)
if let data = try? JSONEncoder().encode(finalResult), let output = String(data: data, encoding: .utf8) {
    print(output)
}
