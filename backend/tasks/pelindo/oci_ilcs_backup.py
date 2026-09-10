"""
tasks/pelindo/oci_ilcs_backup.py
-- Weekly Backup Report OCI ILCS --
Output: /app/shared/reports/pelindo_oci_ilcs_YYYY-MM-DD.docx
"""
import io, os, time
from datetime import datetime
from io import BytesIO

from PIL import Image
from docx import Document
from docx.shared import Inches
from selenium.webdriver.support.ui import WebDriverWait

# Compartment IDs (sama dengan daily_ilcs_status.py)
_C_APPTOS     = "ocid1.compartment.oc1..aaaaaaaa4tgwottsjvkitvfkr7o6re7peql4hs2jibte2a4lmizyujpfgeyq"
_C_T009       = "ocid1.compartment.oc1..aaaaaaaaq2kf2degttsbdwibcqth3ab5qnahm3shpu5javc5iad37gsbdeta"
_C_BELAWAN    = "ocid1.compartment.oc1..aaaaaaaa2ljc3vauaol7oyio2qmfx2ijgn6fb73wjvetjx2555hu4qwbef6a"
_C_TPM        = "ocid1.compartment.oc1..aaaaaaaao6sa4glvzydgw4a4tqjsz3w4izraihkn6x53m26tbnqcriakrixq"
_C_TELUKBAYUR = "ocid1.compartment.oc1..aaaaaaaafdrhbbsr7utuddunf2rgkrweklavoxr65dj6dgr4s2emd64ftj6q"

def _url_boot(ocid, comp, region="ap-singapore-1"):
    return f"https://cloud.oracle.com/block-storage/boot-volumes/{ocid}/boot-volume-backups-tab?region={region}&compartmentId={comp}"

def _url_vol(ocid, comp, region="ap-singapore-1"):
    return f"https://cloud.oracle.com/block-storage/volumes/{ocid}/volume-backups-tab?region={region}&compartmentId={comp}"

def _url_db(dbsys_ocid, db_ocid, comp, region="ap-singapore-1"):
    return f"https://cloud.oracle.com/dbaas/dbsystems/{dbsys_ocid}/databases/{db_ocid}/{db_ocid}/backups?region={region}&compartmentId={comp}"

def _url_db2(dbsys_ocid, dbhome_ocid, db_ocid, comp, region="ap-singapore-1"):
    return f"https://cloud.oracle.com/dbaas/dbsystems/{dbsys_ocid}/databases/{dbhome_ocid}/{db_ocid}/backups?region={region}&compartmentId={comp}"

URL_LIST = [
    # ── 1-10: TPK-009 (T009_PROD) ────────────────────────────────────────────
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01 (Boot Volume)",         _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr56nxvn5z6nzljql3mi6wzuvnvx7q5acequlafgij2wminmjzycra", _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-MEMCACHE (Boot Volume)",      _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrhigqqnunxjj4reamy4pg6jszsmri5vhimytbzple377tlukongca", _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-sitectx",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrxnw7itanexusx3woqvz4e6zwqbodaullcg3afd26wje7ifwx64iq",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-sitelog",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljr4kgmjbesk6st5fwuxs4u2lpsh5k7tzcna7dzhbevit42wnvwcjtq",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-wasarch",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrkwlnsfzycwp2a6axwq4uvxpqthis2657fghkvi7bi6wdsvpr36da",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02 (Boot Volume)",         _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrmwoz3sj5o54mv2g5qx5lpn2dcc6xtmxpp5xn4cchy76ikjgnf3oq", _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-sitectx",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrah4pgwoeqbntyz7dbdtlp2zqieprmtuh54abjkikhgwd7l2fuxpq",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-sitelog",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljr6nwsnemvi6qatqp7dbgtlemykkxamdghis6lzwy35ogbu47flppa",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-wasarch",               _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrbfb3jqy3hv55rm7iq5c6xhrz6dnd7olgozd5sy7ug2lptnxqx4yq",     _C_T009)),
    ("tos-nusantara.ilcs.co.id\ndbtosjkttpk - database",              _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyawkylaqalf6tgyy3zixtfhbmsfswuq3p2lmtdtfafpduq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyafw4kkstuqw7rgngg6cs6xfxjfc2yvojpqv436ujjactq", _C_T009)),
    # ── 11-20: TPM/APPTOS (tos-nusantara.pelindo.co.id) ──────────────────────
    ("tos-nusantara.pelindo.co.id\ntos-memcache (Boot Volume)",        _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6htai5wsn6nte5e36yl4hrxh632huiqltvxhphngy6ecrhqsnjaa", _C_TPM)),
    ("tos-nusantara.pelindo.co.id\ntosprod-instance-01 (Boot Volume)", _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrlz7g42uxmhddjie6gqdxjqjwsv2o7jbxhtexascw2tczuwlvckja", _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos1_sitectx",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrls3r6q63xd2q24rxhdaliov2ew42spor2hngpbz4lzhemn2pdsta",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos1_sitelog",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrzzcrorbxx3nryfvi7sawwjc2yv3xmy5t2iysxonye7oi6o5jysaa",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos1_wasarch",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrdoxhqikz2xf5g5lotagkddcpjfizanfpdcodubsojitxwjjayzfa",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntosprod-instance-02 (Boot Volume)", _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrwtyp5a2bznpblmwefdof3jws6rf22si2qlqrkenjzidkjoy7eetq", _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos2_sitectx",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrpszqf52au7xxqfvyqgxlry6322snpbeukjolak7wjyc2ou3hixra",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos2_sitelog",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrxjnsiylb4w4lrjc25qb3uwzie2me75gerfaw6r2syvajn3kurcya",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ntos2_wasarch",                      _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljraz3ncu3orx5iy7kpprf5hmgvkr7iz2uwwewyukkkvya6zy65srca",     _C_APPTOS)),
    ("tos-nusantara.pelindo.co.id\ndbtostpm - Database",               _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcya7uq5wjsmhfjjc67nxygu5l6zf6devynusuvr6zyrahvq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyamlf3xp6ttrzc4wegunsfisyvzkia5avjx3tqpdqmdbpa", _C_TPM)),
    # ── 21-30: Belawan (BELAWAN_PROD) ─────────────────────────────────────────
    ("tos-nusantara2.pelindo.co.id\nbelawan-memcache (Boot Volume)",   _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrv7fottrvgmbwtqjjotrrivxjxymgdgg63cevux4kcgxbwndxtdmq", _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan-tosprod-01 (Boot Volume)", _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrekcmj6fag6md6tog6bl6guctz5g3p2feb26tzr5skfmxoj372jfa", _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-sitectx",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljryypgyzyaghornraa26pw7sck3cv4rl7wdjamv27hicylpbp22pla",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-sitelog",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrqxgqsidibdlzw2b7ide4vpggcq42nr6lmfvkbxq5gt7nffikk2ma",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-wasarch",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrk6ugiwpgkhlrl53xh7nouwyrolugxcxuqo434ris4t57tbllsqka",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan-tosprod-02 (Boot Volume)", _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6ywons3wn5okxp5tq4sc4x6hfg6ywahapxpuexhpit723azecp3a", _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-sitectx",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrnlaweozuqrrhhekrfavf4el5sf6wh3sytw6jpnhyvoengyiutb2a",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-sitelog",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrje4mcvlq7okhxnswasrhtbodhvtdqfr6e6lrx7lpasrbok3kui4a",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-wasarch",                _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrnit33ras4epeo233p2gzcgabiool4px7zpjvurcbdiiztzkolaya",     _C_BELAWAN)),
    ("tos-nusantara2.pelindo.co.id\ndbtosblw - Database",              _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyawsaj4echvpcu4bk22w5kvdad77qnbi47n3xfnahncwsq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyayhb45sjeieethxvd5ukuqij4btl5w62h2pb2pbkbmnla", _C_BELAWAN)),
    # ── 31-40: TPK-TOS (TELUKBAYUR) ──────────────────────────────────────────
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-MEMCACHE (Boot Volume)",     _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6xyrxdjwzkqz3gupkhlg76gmqhn62nia4pzrgjpm6xxi5wcfegiq", _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS01 (Boot Volume)",        _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrqx6cvgxjwkzk4dpfnqm5mh5bmbtt6nkjqnommd3othrnpu3lpjoa", _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS01-sitectx",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrzpni7e6oyesqvlzr3giyh6zxw2mdmfvie5uq2bb5bvthx2wgsp2q",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS01-sitelog",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljruacmkap467mknksdvircw6lfti46advflqntvvzhjkto374jdb4q",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS01-wasarch",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljr76mlybznoescrqsqlcnbiddbjxfakpm3kncioq66nwdisd33yv5a",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS02 (Boot Volume)",        _url_boot("ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr2wqlnclsrymeveqoslmqw7ur3tvpxjtwi5jxf37yfxhvd4vruhsq", _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS02-sitectx",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrqci7xvgsjjimb34nlvq6eetrcktbzobadcm352gdz44z53hqa7da",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS02-sitelog",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrjgso2dyz6ia4warlthdyjhp2q4vfijbyhnlvpmzg236rfhql7gfa",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\nTPK-TOS-WAS02-wasarch",              _url_vol ("ocid1.volume.oc1.ap-singapore-1.abzwsljrexi3tgxxl5gvwzcvuh4qtreqzzlwoxhwolmxv6ton7ofiqkhvlna",     _C_TELUKBAYUR)),
    ("tos-nusantara3.ilcs.co.id\ndbtostbr - Database",                _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyatt4bzxq3c4zfzfx3vazojjtc6d7fw4wx2ez4gvnutj7q",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyauklgsn7f62xihvmuz5xzq32fhnj3r5v5tb32hqvdccpa", _C_TELUKBAYUR)),
    # ── 41-60: Databases ILCS (APPTOS compartment) ───────────────────────────
    ("praya.ilcs.co.id\nprayareg2 - Database",                        _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcya3a276xjcjbgmsxrdklbf36x7ghrhbzvsjeww7wvnl6eq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyanbf7wu7rji4klgfo2hk6qsf5emrcuai5m42af2ophpnq", _C_APPTOS)),
    ("praya.pelindo.co.id\ndbsinglebilling - Database",               _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyauvukyq3ba5zaecg7luxk4waar5xjomafnqelds2bdx6q",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyauh5xvxmtxxvhqwmzhj2f3lmz3qhl4omdsqijeqr6nxxq", _C_APPTOS)),
    ("praya2.pelindo.co.id\nprayablw - Database",                     _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcya3khv3rypvdth2vsox4qesv6s4f3d4j5rffuxsgmyc7ua",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyab6vxpcvooxf4mla3xhbule573c54flgp7x7aledtc6uq", _C_APPTOS)),
    ("praya3.ilcs.co.id\nprayatpk - Database",                        _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyauerrvoftbugneabqlkgt3onvgbnlbomp7w6ragw7y5pa",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyanev43vjkl4ojl6utqvcbvtelnq2zumrn6phxtdwncdka", _C_APPTOS)),
    ("parama.pelindo.co.id\ndbcustomerportalprod - Database",         _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyalhbo463bqyo3lf6txblatusckuakuxjsrvgmjgyj5saq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyapycubsyralwog3kq6qcwslzc5hmawscyf3h7pxfu534a", _C_APPTOS)),
    ("phinnisi.pelindo.co.id\nphns - Database",                       _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcya6u7pprqx72ydp3j6ldviyuwxhzpazt5g7erlfklc7ioq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyaadlpjobydlhq57b5gvz3lbw2rc5ium7nwngfav4z4m5a", _C_APPTOS)),
    ("ptosm.pelindo.co.id\np-ptosm - Database",                       _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyazushhxptn5wfe2o22mpcmt2uidfkf7pzrtplwh2yel3a",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcya7ijqcnsvvdm6zq7pljdo6zk4j3btr77hbicbdpjiebyq", _C_APPTOS)),
    ("ptosc.pelindo.co.id\np-ptosc - Database",                       _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyabbzyx72gfkcjuckwdwkgj2mujstyabbtytsfrtewzgpa",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyagvjy5rd2shhqutffxo47m2pwwxavhebdncvhsxqa5kja", _C_APPTOS)),
    ("ptosr.pelindo.co.id\nptor-db - Database",                       _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyavtdmmfhubl4zmqycfn64aggmbd4qcqvb7itsq6gwtkja",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyap4pfziver6s6qrwimrduqrjsec3shhqlyl2c7rkohquq", _C_APPTOS)),
    ("Gate\nAutogate - Database",                                      _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyaajg5zuz556yov6ha3xf5zxis766j2mjktljazf3s352q",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyalkfsj4aq6mo34y7ld4cq6nzvsznx6dztg66x63zjed7q", _C_APPTOS)),
    ("TOSHUB\nTOSHUB - Database",                                      _url_db2 ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyaopg5xl3rrvmfkajuscgioybtgvk5ow2rpevibjsdtmxq",
                                                                                  "ocid1.dbhome.oc1.ap-singapore-1.anzwsljryvgf62iai2glebweljuqiuvzsbpqshf45eb7jprey22x3mwaxuva",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyatuwuzm3afc3etjz6ofa6nq5khiz6d2vkntldor46jdua", _C_APPTOS)),
    ("PTOS-PK\nPTOS-PK - Database",                                    _url_db  ("ocid1.dbsystem.oc1.ap-batam-1.anrguljrp7dotcyalsxhljsuh76yl5ynmz5uzbx7yqrswglebaxwu6efbzjq",
                                                                                  "ocid1.database.oc1.ap-batam-1.anrguljrp7dotcyad3rvz3xqflqgjcf4kjlxszbb4nupgynnivetsipvdwva", _C_APPTOS, "ap-batam-1")),
    ("p-gate\np-gate - Database",                                      _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyadxf3t3pofthgytmd6tlys5pth5dxr7kaff3yjslszi5a",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyadeb2quaxvjewgb7vpq5bt4bull5o63yya6v6rhthy24a", _C_APPTOS)),
    ("p-devptos\np-devptos - Database",                                _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyanfwaytdmr7xw2b7gqamfrpeapsqmwgjjxw4jivuncala",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyat46kestvwusebulvqpd6s6polusyc6axnhrse3aomukq", _C_APPTOS)),
    ("p-dev-tos\np-p-dev-tos - Database",                              _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyawkonbf6t45vtskkzh6omz6qqr45vurrctl3tzlxo5oka",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyavqxexgt75yrym3hng53dazetx74tfczlnytohdrlwqba", _C_APPTOS)),
    ("p-dev-tos\nptosdev - Database",                                  _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyasmarqdzhtp3c57b7iaq6clz6yu6msmk5mkw3b6ucfzwq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcya4f723dls2pifzieonn4is7pyrs3ume4lkmnhfajdwvua", _C_APPTOS)),
    ("p-dev-tos\ndtosdev - Database",                                  _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyalfvttpdsj6q2cpvfuvlv5owgje4hnvxadz5f6gadqegq",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyans2x7fc7ecq72o3we332spvcgfvho7h5cp63vhrh4kzq", _C_APPTOS)),
    ("Pelindo Hub\ndb-repo-pelindo-hub - Database",                    _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyaane5wnxdp3orwil7xlydhgywuzkmupclmovaoewzyd6a",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyav2ts5za64g73ujvj6lybgfbqysmg3h6ofdxf3v6dytdq", _C_APPTOS)),
    ("Pelindo Hub Stagging\nstagging - Database",                      _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyabz22hpr2jd4y4s25wuq2gbd4senqdtks2bxxtdimrgua",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyajeqrtpzm5zymbljwia5r2y4v3ocesndcz66tihk2g6uq", _C_APPTOS)),
    ("DBTOSQA\nDTOSQA - Database",                                    _url_db  ("ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyarmal5rkk3ew3n4zvuxdmfjvonobz5nrc5ppcw3b2on7a",
                                                                                  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyad4tlxuiagninoqgmydko7m7fovkq4bruuochsh2mwv7q", _C_APPTOS)),
]


def run(log_path=None, args=None, driver=None):
    def log(msg):
        if log_path:
            with open(log_path, "a") as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    from chrome_helper import get_driver

    own_driver = driver is None
    if own_driver:
        import oci_session
        driver = get_driver(2560, 1440)
        if not oci_session.load_cookies(driver):
            driver.quit()
            return "ERROR: OCI cookies tidak ditemukan. Login OCI dari dashboard dulu."
        driver.get("https://cloud.oracle.com")
        time.sleep(8)
        if "sign-in" in driver.current_url or "login" in driver.current_url:
            driver.quit()
            return "ERROR: OCI session expired. Silakan login ulang."

    wait        = WebDriverWait(driver, 60)
    saved_files = []
    TODAY       = datetime.now().strftime("%Y-%m-%d")

    try:
        log("Session valid, starting capture...")

        for idx, (name, url) in enumerate(URL_LIST):
            short_name = name.split(chr(10))[1] if chr(10) in name else name
            log(f"Opening: {short_name}")
            driver.get(url)

            base_wait = 5 if idx == 0 else 3
            time.sleep(base_wait)

            if "sign-in" in driver.current_url or "login" in driver.current_url:
                log(f"  SKIP: {short_name} — session expired")
                continue

            try:
                from selenium.webdriver.support import expected_conditions as EC2
                from selenium.webdriver.common.by import By as BY2
                WebDriverWait(driver, 10).until(
                    EC2.presence_of_element_located((BY2.CSS_SELECTOR,
                        "table tbody tr, .oui-table tbody tr, [role='row']"))
                )
                time.sleep(1)
            except Exception:
                time.sleep(2)

            driver.execute_script("window.scrollTo(0, 150)")
            time.sleep(0.5)

            png   = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(png))
            w, h  = image.size

            left_crop   = 30
            top_crop    = 80
            right_crop  = max(w - 20, left_crop + 1)
            bottom_crop = max(h - 90, top_crop + 1)

            cropped = image.crop((left_crop, top_crop, right_crop, bottom_crop))
            stream  = BytesIO()
            cropped.save(stream, format="PNG")
            stream.seek(0)
            saved_files.append((name, stream))
            log(f"Captured: {short_name}")

    finally:
        if own_driver:
            driver.quit()

    if not saved_files:
        return "ERROR: Tidak ada halaman berhasil di-capture."

    log(f"Total captured: {len(saved_files)} — Generating Word report...")

    output_dir = "/app/shared/reports"
    os.makedirs(output_dir, exist_ok=True)
    doc_name = f"{output_dir}/pelindo_oci_ilcs_{TODAY}.docx"

    document = Document()
    document.add_heading(f"Oracle Backup Report ILCS - {TODAY}", level=1)

    for i in range(0, len(saved_files), 2):
        name1, img1 = saved_files[i]
        document.add_paragraph(name1, style="Heading 3")
        p1 = document.add_paragraph()
        p1.add_run().add_picture(img1, width=Inches(6.5))

        if i + 1 < len(saved_files):
            name2, img2 = saved_files[i + 1]
            document.add_paragraph(name2, style="Heading 3")
            p2 = document.add_paragraph()
            p2.add_run().add_picture(img2, width=Inches(6.5))

        document.add_page_break()

    document.save(doc_name)
    log(f"Report saved: {doc_name}")

    # Hapus file lama, sisakan 2 terbaru
    try:
        all_files = sorted(
            [f for f in os.listdir(output_dir) if f.startswith("pelindo_oci_ilcs_") and f.endswith(".docx")],
            reverse=True
        )
        for old in all_files[2:]:
            if old != os.path.basename(doc_name):
                os.remove(os.path.join(output_dir, old))
                log(f"Deleted old file: {old}")
    except Exception as e:
        log(f"Cleanup warning: {e}")

    return f"DONE: {os.path.basename(doc_name)}"
