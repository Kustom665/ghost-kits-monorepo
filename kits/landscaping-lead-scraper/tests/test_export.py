import csv

from leadscraper.export import existing_keys, write_csv
from leadscraper.models import CSV_FIELDS, Lead


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class TestWriteCsv:
    def test_writes_header_and_rows(self, tmp_path):
        out = tmp_path / "leads.csv"
        leads = [Lead(source="Craigslist", title="Need mowing", url="https://a.com", phone="512-555-0134")]

        assert write_csv(leads, str(out)) == 1

        rows = read_rows(out)
        assert list(rows[0].keys()) == CSV_FIELDS
        assert rows[0]["phone"] == "512-555-0134"

    def test_overwrites_without_append(self, tmp_path):
        out = tmp_path / "leads.csv"
        write_csv([Lead(source="A", title="one", url="https://one.com")], str(out))
        write_csv([Lead(source="B", title="two", url="https://two.com")], str(out))

        rows = read_rows(out)
        assert len(rows) == 1
        assert rows[0]["title"] == "two"

    def test_append_skips_leads_already_in_the_file(self, tmp_path):
        out = tmp_path / "leads.csv"
        write_csv([Lead(source="A", title="one", url="https://one.com")], str(out))

        again = [
            Lead(source="A", title="one", url="https://one.com/?utm=x"),  # same listing
            Lead(source="A", title="two", url="https://two.com"),
        ]
        assert write_csv(again, str(out), append=True) == 1

        rows = read_rows(out)
        assert [row["title"] for row in rows] == ["one", "two"]

    def test_append_to_missing_file_creates_it(self, tmp_path):
        out = tmp_path / "nested" / "leads.csv"
        assert write_csv([Lead(source="A", title="one", url="https://one.com")], str(out), append=True) == 1
        assert len(read_rows(out)) == 1

    def test_append_with_nothing_new_leaves_file_untouched(self, tmp_path):
        out = tmp_path / "leads.csv"
        leads = [Lead(source="A", title="one", url="https://one.com")]
        write_csv(leads, str(out))
        before = out.read_text()

        assert write_csv(leads, str(out), append=True) == 0
        assert out.read_text() == before

    def test_blank_fields_serialize_as_empty_strings(self, tmp_path):
        out = tmp_path / "leads.csv"
        write_csv([Lead(source="A", title="no contact info")], str(out))
        assert read_rows(out)[0]["phone"] == ""


class TestExistingKeys:
    def test_missing_file_has_no_keys(self, tmp_path):
        assert existing_keys(str(tmp_path / "nope.csv")) == set()

    def test_keys_are_canonical(self, tmp_path):
        out = tmp_path / "leads.csv"
        write_csv([Lead(source="A", title="one", url="https://WWW.One.com/x/")], str(out))
        assert existing_keys(str(out)) == {"https://one.com/x"}
