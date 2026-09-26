import java.awt.*;
import java.awt.font.TextAttribute;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.List;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

/** Build-time thumbnail renderer for CrewCheck's current WFF subset, NOT a WFF runtime.
 * Geometry, color, style selection, original logo and AOD visibility come from the XML.
 * Text uses Java logical fonts and illustrative data: physical Wear validation remains required.
 * This file lives outside src/main and is never compiled into the resource-only face APK. */
public final class PreviewGenerator {
    static final String[] NAMES = {"signature", "flightdeck", "minimal"};
    static final String[] PALETTES = {"cyan", "violet", "magenta"};
    // Selector-only examples. These values never become provider defaults or live app data.
    static final Map<String, String[]> EXAMPLES = Map.of(
        "1", new String[]{"PRÓXIMO PASSO", "Escala no pulso"},
        "2", new String[]{"PORTÃO", "--"},
        "5", new String[]{"BATERIA", "--"},
        "3", new String[]{"CREWLIFE", "--"},
        "6", new String[]{"PASSOS", "--"},
        "4", new String[]{"ROTINA", "--"}
    );
    // A runtime provider may supply an icon without a title. Preview fixtures have
    // no such image by default: do not fabricate a battery graphic in its place.
    final Map<String, String[]> examples = new HashMap<>(EXAMPLES);
    final Map<String, BufferedImage> exampleIcons = new HashMap<>();
    final Path res;
    final Element root;
    final BufferedImage logo;
    final String[] colors;
    final String style;
    final boolean ambient;
    final String time;

    static Document parse(Path path) throws Exception {
        var f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return f.newDocumentBuilder().parse(path.toFile());
    }
    static List<Element> children(Element e) {
        List<Element> result = new ArrayList<>();
        for (Node n = e.getFirstChild(); n != null; n = n.getNextSibling())
            if (n instanceof Element) result.add((Element)n);
        return result;
    }
    static Element child(Element e, String tag) {
        return children(e).stream().filter(n -> n.getTagName().equals(tag)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Missing " + tag + " in " + e.getTagName()));
    }
    static double number(Element e, String key, double fallback) {
        return e.hasAttribute(key) ? Double.parseDouble(e.getAttribute(key)) : fallback;
    }
    static String sha(Path p) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(p)));
    }
    PreviewGenerator(Path res, String style, int palette, boolean ambient) throws Exception {
        this.res = res; this.style = style; this.ambient = ambient;
        root = parse(res.resolve("raw/watchface.xml")).getDocumentElement();
        if (number(root, "width", 0) != 450 || number(root, "height", 0) != 450)
            throw new IllegalArgumentException("Requalify thumbnail renderer for new canvas");
        logo = ImageIO.read(res.resolve("drawable-nodpi/crewcheck_logo_neon.png").toFile());
        if (logo == null) throw new IOException("Invalid original logo");
        var config = child(child(root, "UserConfigurations"), "ColorConfiguration");
        var colorOption = children(config).stream().filter(n -> n.getAttribute("id").equals("" + palette)).findFirst().orElseThrow();
        colors = colorOption.getAttribute("colors").split("\s+");
        time = children(root).stream().filter(n -> n.getTagName().equals("Metadata")
            && n.getAttribute("key").equals("PREVIEW_TIME")).findFirst().orElseThrow().getAttribute("value").substring(0, 5);
    }
    Color color(String value) {
        if (value.startsWith("[CONFIGURATION.crewcheck_palette."))
            value = colors[Integer.parseInt(value.substring(value.lastIndexOf('.') + 1, value.length() - 1))];
        if (!value.matches("#[0-9A-Fa-f]{8}")) throw new IllegalArgumentException("Unsupported color: " + value);
        return new Color((int)Long.parseLong(value.substring(1), 16), true);
    }
    int alpha(Element e) {
        int value = (int)number(e, "alpha", 255);
        if (ambient) for (Element v : children(e))
            if (v.getTagName().equals("Variant") && v.getAttribute("mode").equals("AMBIENT")) {
                if (!v.getAttribute("target").equals("alpha")) throw new IllegalArgumentException("Unsupported Variant");
                value = Integer.parseInt(v.getAttribute("value"));
            }
        return value;
    }
    static String resolveDisplay(String expression, String title, String value) {
        Pattern rule = Pattern.compile("^\\[COMPLICATION\\.(TITLE|TEXT)\\] == \"([^\"\\\\]*)\" \\? \"([^\"\\\\]*)\" : (.+)$");
        String source = null, selected = null, remaining = expression;
        boolean matched = false;
        for (var m = rule.matcher(remaining); m.matches(); m = rule.matcher(remaining)) {
            String field = m.group(1);
            if (source != null && !source.equals(field)) throw new IllegalArgumentException("Mixed text sources");
            source = field;
            String current = field.equals("TITLE") ? title : value;
            if (!matched && current.equals(m.group(2))) { selected = m.group(3); matched = true; }
            remaining = m.group(4);
        }
        if (!remaining.equals("[COMPLICATION.TITLE]") && !remaining.equals("[COMPLICATION.TEXT]"))
            throw new IllegalArgumentException("Unsupported preview expression: " + expression);
        String fallbackField = remaining.substring(14, remaining.length() - 1);
        if (source != null && !source.equals(fallbackField)) throw new IllegalArgumentException("Changed fallback source");
        return matched ? selected : (fallbackField.equals("TITLE") ? title : value);
    }
    String text(Element font, String slot) {
        Element holder = font;
        boolean upper = children(font).stream().anyMatch(n -> n.getTagName().equals("Upper"));
        if (upper) holder = child(font, "Upper");
        Element template = child(holder, "Template");
        StringBuilder pattern = new StringBuilder();
        for (Node n = template.getFirstChild(); n != null; n = n.getNextSibling())
            if (n.getNodeType() == Node.TEXT_NODE) pattern.append(n.getNodeValue());
        String result = pattern.toString();
        for (Element p : children(template)) {
            String value = switch(p.getAttribute("expression")) {
                case "[DAY_OF_WEEK_S]" -> "SÁB";
                case "[DAY_Z]" -> "26";
                case "[MONTH_S]" -> "SET";
                case "[COMPLICATION.TITLE]" -> examples.get(slot)[0];
                case "[COMPLICATION.TEXT]" -> examples.get(slot)[1];
                default -> resolveDisplay(p.getAttribute("expression"), examples.get(slot)[0], examples.get(slot)[1]);
            };
            int i = result.indexOf("%s");
            if (i < 0) throw new IllegalArgumentException("Template arity mismatch");
            result = result.substring(0, i) + value + result.substring(i + 2);
        }
        if (result.contains("%s")) throw new IllegalArgumentException("Unresolved template");
        return upper ? result.toUpperCase(Locale.ROOT) : result;
    }
    void drawText(Graphics2D g, Element font, String value, double width, double height, int maxLines) {
        String weight = font.getAttribute("weight");
        Font f = new Font(Font.SANS_SERIF, weight.equals("BOLD") ? Font.BOLD : Font.PLAIN, 1)
            .deriveFont((float)number(font, "size", 18));
        if (weight.equals("THIN")) f = f.deriveFont(Map.of(TextAttribute.WEIGHT, TextAttribute.WEIGHT_EXTRA_LIGHT));
        g.setFont(f); g.setColor(color(font.getAttribute("color")));
        FontMetrics m = g.getFontMetrics();
        List<String> lines = new ArrayList<>();
        String line = "";
        for (String word : value.split("\s+")) {
            String next = line.isEmpty() ? word : line + " " + word;
            if (!line.isEmpty() && m.stringWidth(next) > width && lines.size() < maxLines - 1) {
                lines.add(line); line = word;
            } else line = next;
        }
        lines.add(line);
        for (int i = 0; i < lines.size(); i++) {
            String s = lines.get(i);
            if (m.stringWidth(s) > width) {
                while (!s.isEmpty() && m.stringWidth(s + "…") > width)
                    s = s.substring(0, s.offsetByCodePoints(s.length(), -1));
                lines.set(i, s + "…");
            }
        }
        double baseline = (height - lines.size() * m.getHeight()) / 2 + m.getAscent();
        for (String s : lines) {
            g.drawString(s, (float)((width - m.stringWidth(s)) / 2), (float)baseline);
            baseline += m.getHeight();
        }
    }
    void paint(Element e, Graphics2D parent, String slot) {
        int a = alpha(e);
        if (a == 0) return;
        Graphics2D g = (Graphics2D)parent.create();
        try {
            float inherited = ((AlphaComposite)g.getComposite()).getAlpha();
            g.setComposite(AlphaComposite.SrcOver.derive(inherited * a / 255f));
            g.translate(number(e, "x", 0), number(e, "y", 0));
            double w = number(e, "width", 450), h = number(e, "height", 450);
            switch(e.getTagName()) {
                case "Scene" -> {
                    g.setColor(color(e.getAttribute("backgroundColor"))); g.fill(new Rectangle2D.Double(0, 0, w, h));
                    for (Element n : children(e)) paint(n, g, slot);
                }
                case "ListConfiguration" -> {
                    Element option = children(e).stream().filter(n -> n.getAttribute("id").equals(style)).findFirst().orElseThrow();
                    for (Element n : children(option)) paint(n, g, slot);
                }
                case "Group", "DigitalClock", "PartDraw" -> {
                    for (Element n : children(e)) paint(n, g, slot);
                }
                case "PartImage" -> {
                    String resource = child(e, "Image").getAttribute("resource");
                    BufferedImage image;
                    if (resource.equals("crewcheck_logo_neon")) image = logo;
                    else if (resource.equals("[COMPLICATION.MONOCHROMATIC_IMAGE]")) image = exampleIcons.get(slot);
                    else throw new IllegalArgumentException("Unexpected image; requalify preview");
                    if (image != null) g.drawImage(image, 0, 0, (int)w, (int)h, null);
                }
                case "TimeText" -> {
                    if (!e.getAttribute("format").equals("hh:mm")) throw new IllegalArgumentException("Unexpected clock format");
                    g.clip(new Rectangle2D.Double(0, 0, w, h));
                    drawText(g, child(e, "Font"), time, w, h, 1);
                }
                case "PartText" -> {
                    for (Element local : children(e)) if (local.getTagName().equals("Localization")) {
                        if (local.getAttributes().getLength() != 1 || !local.getAttribute("locales").equals("pt_BR"))
                            throw new IllegalArgumentException("Requalify calendar locale/timezone in previews");
                    }
                    Element t = child(e, "Text"), font = child(t, "Font");
                    if (!t.getAttribute("align").equals("CENTER")) throw new IllegalArgumentException("Unexpected text alignment");
                    g.clip(new Rectangle2D.Double(0, 0, w, h));
                    drawText(g, font, text(font, slot), w, h, (int)number(t, "maxLines", 1));
                }
                case "RoundRectangle" -> {
                    var shape = new RoundRectangle2D.Double(0, 0, w, h, 2 * number(e, "cornerRadiusX", 0), 2 * number(e, "cornerRadiusY", 0));
                    for (Element style : children(e)) {
                        g.setColor(color(style.getAttribute("color")));
                        if (style.getTagName().equals("Fill")) g.fill(shape);
                        else if (style.getTagName().equals("Stroke")) {
                            g.setStroke(new BasicStroke((float)number(style, "thickness", 1))); g.draw(shape);
                        } else throw new IllegalArgumentException("Unsupported shape style");
                    }
                }
                case "ComplicationSlot" -> {
                    String id = e.getAttribute("slotId");
                    if (!EXAMPLES.containsKey(id)) throw new IllegalArgumentException("Unknown slot " + id);
                    String type = id.equals("1") ? "LONG_TEXT" : "SHORT_TEXT";
                    Element c = children(e).stream().filter(n -> n.getTagName().equals("Complication")
                        && n.getAttribute("type").equals(type)).findFirst().orElseThrow();
                    for (Element n : children(c)) paint(n, g, id);
                }
                case "Condition" -> {
                    // A deliberately narrow preview subset, not a generic WFF interpreter.
                    Element expression = child(child(e, "Expressions"), "Expression");
                    if (!slot.equals("5") || !expression.getAttribute("name").equals("battery_title_missing")
                            || !expression.getTextContent().equals("textLength([COMPLICATION.TITLE]) == 0")
                            || children(e).size() != 2)
                        throw new IllegalArgumentException("Unsupported preview condition");
                    Element compare = child(e, "Compare");
                    if (!compare.getAttribute("expression").equals("battery_title_missing"))
                        throw new IllegalArgumentException("Unbound condition");
                    if (examples.get(slot)[0].isEmpty())
                        for (Element n : children(compare)) paint(n, g, slot);
                }
                case "Variant" -> { /* applied before painting */ }
                default -> throw new IllegalArgumentException("Unsupported preview element: " + e.getTagName());
            }
        } finally { g.dispose(); }
    }
    BufferedImage render(int size) {
        BufferedImage hi = new BufferedImage(900, 900, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = hi.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.scale(2, 2); g.clip(new Ellipse2D.Double(0, 0, 450, 450));
        paint(child(root, "Scene"), g, ""); g.dispose();
        BufferedImage result = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D small = result.createGraphics();
        small.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        small.drawImage(hi, 0, 0, size, size, null); small.dispose();
        return result;
    }
    static void write(BufferedImage image, Path file) throws IOException {
        Files.createDirectories(file.getParent());
        if (!ImageIO.write(image, "PNG", file.toFile())) throw new IOException("PNG writer unavailable");
    }
    static void check(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
    static void black(BufferedImage image, int x, int y, int width, int height) {
        for (int row = y; row < y + height; row++) for (int col = x; col < x + width; col++)
            check(image.getRGB(col, row) == 0xFF000000, "Ambient privacy region must be black");
    }
    static void verify(Path res, Path out, Path gallery) throws Exception {
        Element xml = parse(res.resolve("raw/watchface.xml")).getDocumentElement();
        Element config = child(child(xml, "UserConfigurations"), "ListConfiguration");
        check(config.getAttribute("defaultValue").equals("0"), "Picker preview must track default Signature");
        check(children(config).size() == 3, "Three editor styles expected");
        for (int i = 0; i < 3; i++) {
            Element option = children(config).get(i);
            check(option.getAttribute("id").equals("" + i), "Stable editor ids required");
            check(option.getAttribute("icon").equals("crewcheck_preview_" + NAMES[i]), "Missing style icon reference");
            Path png = out.resolve("drawable-nodpi/" + option.getAttribute("icon") + ".png");
            BufferedImage image = ImageIO.read(png.toFile());
            check(image.getWidth() == 360 && image.getHeight() == 360, "Editor icons must fit the 400px ceiling");
            check((image.getRGB(0, 0) >>> 24) == 0, "Round preview must have transparent corners");
        }
        Element info = parse(res.resolve("xml/watch_face_info.xml")).getDocumentElement();
        check(child(info, "Preview").getAttribute("value").equals("@drawable/crewcheck_preview_signature"), "Default picker resource missing");
        check(child(info, "Editable").getAttribute("value").equals("true"), "Native editing must be available");
        Set<String> styles = new HashSet<>();
        for (String name : NAMES) styles.add(sha(out.resolve("drawable-nodpi/crewcheck_preview_" + name + ".png")));
        check(styles.size() == 3, "Style previews must not be duplicates");
        for (String name : NAMES) for (String palette : PALETTES) {
            BufferedImage ambient = ImageIO.read(gallery.resolve(name + "-" + palette + "-aod.png").toFile());
            black(ambient, 207, 20, 36, 36); // Original logo hidden in AOD.
            black(ambient, 229, 62, 124, 52); // Battery hidden in AOD.
            black(ambient, 101, 332, 248, 54); // CrewLife and steps hidden.
            black(ambient, 153, 394, 144, 28); // Routine hidden.
        }
        var copyCheck = new PreviewGenerator(res, "0", 0, false);
        Element scene = child(copyCheck.root, "Scene");
        for (Element slot : children(scene)) if (slot.getTagName().equals("ComplicationSlot")) {
            String sid = slot.getAttribute("slotId");
            Element comp = child(slot, "Complication");
            for (Element part : children(comp)) if (part.getTagName().equals("PartText")) {
                Element font = child(child(part, "Text"), "Font");
                for (Element param : children(child(font, "Template"))) {
                    String expr = param.getAttribute("expression");
                    boolean title = expr.startsWith("[COMPLICATION.TITLE]");
                    check(resolveDisplay(expr, "Weather", "9,332").equals(title ? "Weather" : "9,332"), "Custom source or number was relabeled");
                    check(resolveDisplay(expr, "", "0").equals(title ? "" : "0"), "Missing title or genuine zero changed");
                    if (sid.equals("6") && title)
                        check(resolveDisplay(expr, "Steps", "--").equals("PASSOS"), "Steps was not localized");
                    if (sid.equals("3") && !title)
                        check(resolveDisplay(expr, "CrewLife", "--").equals("—"), "Placeholder must stay missing, not become zero");
                }
            }
        }
        // Synthetic icon is ONLY a test fixture, never written to a selector resource.
        var iconTest = new PreviewGenerator(res, "0", 0, false);
        iconTest.examples.put("5", new String[]{"", "--"});
        BufferedImage synthetic = new BufferedImage(22, 22, BufferedImage.TYPE_INT_ARGB);
        Graphics2D marker = synthetic.createGraphics(); marker.setColor(Color.WHITE); marker.fillRect(0, 0, 22, 22); marker.dispose();
        iconTest.exampleIcons.put("5", synthetic);
        check(iconTest.render(450).getRGB(291, 73) != 0xFF000000, "Missing-title branch lost the provider icon");
        iconTest.examples.put("5", new String[]{"Battery", "--"});
        BufferedImage withTitle = iconTest.render(450);
        iconTest.exampleIcons.clear();
        BufferedImage withoutIcon = iconTest.render(450);
        for (int y = 62; y < 84; y++) for (int x = 280; x < 302; x++)
            check(withTitle.getRGB(x, y) == withoutIcon.getRGB(x, y), "Icon overlaps a supplied caption");
        var aodIcon = new PreviewGenerator(res, "0", 0, true);
        aodIcon.examples.put("5", new String[]{"", "--"}); aodIcon.exampleIcons.put("5", synthetic);
        black(aodIcon.render(450), 229, 62, 124, 52);
        var malformed = new PreviewGenerator(res, "0", 0, false);
        child(malformed.root, "Scene").appendChild(malformed.root.getOwnerDocument().createElement("UnsupportedPreviewElement"));
        boolean rejected = false;
        try { malformed.render(360); } catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, "Generator must fail on unsupported additions instead of silently hiding them");
        System.out.println("PASS: metadata/editor links, three distinct icons, 9 AOD privacy checks, unknown-element negative case");
    }
    public static void main(String[] args) throws Exception {
        if (args.length < 2 || args.length > 3) throw new IllegalArgumentException("Usage: PreviewGenerator.java <source res> <generated res> [gallery]");
        Path res = Path.of(args[0]), out = Path.of(args[1]);
        for (int s = 0; s < NAMES.length; s++) {
            var renderer = new PreviewGenerator(res, "" + s, 0, false);
            write(renderer.render(360), out.resolve("drawable-nodpi/crewcheck_preview_" + NAMES[s] + ".png"));
        }
        if (args.length == 3) {
            Path gallery = Path.of(args[2]);
            for (int s = 0; s < 3; s++) for (int p = 0; p < 3; p++) for (boolean aod : new boolean[]{false, true})
                write(new PreviewGenerator(res, "" + s, p, aod).render(450),
                    gallery.resolve(NAMES[s] + "-" + PALETTES[p] + (aod ? "-aod" : "-active") + ".png"));
            Files.writeString(gallery.resolve("PROVENANCE.txt"),
                "Technical previews generated from WFF, NOT Wear OS screenshots.\n" +
                "Illustrative placeholders; no real flight, health or account data.\n" +
                "Java logical fonts, text wrapping and rasterization approximate the device.\n" +
                "Complication icons depend on the selected provider; fixtures omit absent icons.\n" +
                "watchface.xml SHA-256: " + sha(res.resolve("raw/watchface.xml")) + "\n" +
                "Original logo SHA-256: " + sha(res.resolve("drawable-nodpi/crewcheck_logo_neon.png")) + "\n" +
                "Java runtime: " + System.getProperty("java.runtime.version") + "\n");
            verify(res, out, gallery);
        }
        System.out.println("PASS: three 360px selector resources" + (args.length == 3 ? " + 18 illustrative active/AOD previews" : ""));
    }
}
