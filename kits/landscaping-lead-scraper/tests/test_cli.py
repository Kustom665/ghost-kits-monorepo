import pytest

from leadscraper.cli import build_parser, normalize_city


class TestNormalizeCity:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Austin", "austin"),
            ("San Antonio", "sanantonio"),
            ("Winston-Salem", "winstonsalem"),
            ("  Fort Worth ", "fortworth"),
        ],
    )
    def test_matches_craigslist_subdomain_form(self, raw, expected):
        assert normalize_city(raw) == expected


class TestParser:
    def test_city_is_required(self):
        with pytest.raises(SystemExit):
            build_parser().parse_args([])

    def test_facebook_is_off_by_default(self):
        args = build_parser().parse_args(["--city", "austin"])
        assert args.facebook_group == []

    def test_facebook_groups_accumulate(self):
        args = build_parser().parse_args(
            ["--city", "austin", "--facebook-group", "111", "--facebook-group", "222"]
        )
        assert args.facebook_group == ["111", "222"]

    def test_defaults(self):
        args = build_parser().parse_args(["--city", "austin"])
        assert args.output == "landscaping_leads.csv"
        assert args.append is False
        assert args.max_per_source == 100
