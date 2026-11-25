// Mesma lógica de WatchFaceXmlValidator.validateXMLSchema (google/watchface, third_party/wff):
// Xerces XSD 1.1 contra documents/<versão>/watchface.xsd.
import java.io.File;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.*;
import org.xml.sax.SAXParseException;
public class WffValidate {
  public static void main(String[] a) throws Exception {
    String xsd = a[0] + "/" + a[1] + "/watchface.xsd";
    SchemaFactory f = SchemaFactory.newInstance("http://www.w3.org/XML/XMLSchema/v1.1");
    Schema s = f.newSchema(new File(xsd));
    try {
      s.newValidator().validate(new StreamSource(new File(a[2])));
      System.out.println("VALID: WFF v" + a[1] + " " + a[2]);
    } catch (SAXParseException e) {
      System.out.printf("INVALID [Line %d:Column %d]: %s%n", e.getLineNumber(), e.getColumnNumber(), e.getMessage());
      System.exit(1);
    }
  }
}
